
import {
    Alert,
    StyleSheet,
    TextInput,
    View
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { NavigationProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Text, TouchableOpacity } from 'react-native';
import { MediaStream, RTCIceCandidate, RTCPeerConnection } from 'react-native-webrtc';
import { RootStackParamList } from '../App';

const configuration = {
    "iceServers": [
        { "url": "stun:stun.1.google.com:19302" },
        { "url": "stun:stun1.1.google.com:19302" },
        { "url": "stun:stun.l.google.com:19302" }
    ]
};

interface CallScreenProps {
    navigation: NavigationProp<RootStackParamList, 'CallScreen'>;
}

interface User {
    id: string;
    timestamp: any;
}

export default function CallScreen({ navigation }: CallScreenProps) {
    // const navigation = useNavigation();
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [gettingCall, setGettingCall] = useState(false);
    const [isAudioCall, setIsAudioCall] = useState(false);
    const pc = useRef<RTCPeerConnection>(
        new RTCPeerConnection()
    );
    const connecting = useRef(false);
    let stream: MediaStream | null = null;

    const [myId, setMyId] = useState<string>('');
    const [targetId, setTargetId] = useState<string>('');
    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const callStartTime = useRef<number | null>(null);

    //switch
    const [isEnabled, setIsEnabled] = useState(false);
    const toggleSwitch = () => setIsEnabled(previousState => !previousState);

    //save id 
    const [users, setUsers] = useState<User[]>([]);
    const [showInput, setShowInput] = useState(false);

    useEffect(() => {
        const loadId = async () => {
            const savedId = await AsyncStorage.getItem('myId');
            if (savedId) {
                setMyId(savedId);
                setShowInput(false);
                fetchUsers(savedId); // Fetch users immediately if ID exists
            } else {
                setShowInput(true);
            }
        };
        loadId();
    }, []);

    useEffect(() => {
        if (!myId || !targetId) return;

        const callId = `${targetId}_${myId}`; // Incoming call
        const outgoingCallId = `${myId}_${targetId}`; // Outgoing call
        const cref = firestore().collection("meet").doc(callId);
        const outgoingCref = firestore().collection("meet").doc(outgoingCallId);

        const subscribe = cref.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (data && data.offer && data.targetId === myId && !connecting.current) {
                setGettingCall(true);
            }
            if (snapshot.exists && data?.hangup) {
                hangup();
            }
        });

        const subscribeOutgoing = outgoingCref.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (snapshot.exists && data?.hangup) {
                hangup();
            }
        });

        const subscrbeDelete = cref.collection(myId).onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === "removed") {
                    hangup();
                }
            });
        });
        return () => {
            subscribe();
            subscribeOutgoing();
            subscrbeDelete();
        };
    }, [myId, targetId]);

    //fetch users
    const fetchUsers = (currentId: string) => {
        if (!currentId || currentId.length !== 5 || !/^\d+$/.test(currentId)) return;
        firestore()
            .collection('users') // Changed from 'meet' to 'users' for clarity
            .onSnapshot(snapshot => {
                const userList = snapshot.docs
                    .map(doc => ({ id: doc.data().id, timestamp: doc.data().timestamp }))
                    .filter(user => user.id !== currentId); // Exclude current user
                setUsers(userList);
            });
    };


    //call end function
    const hangup = async () => {
        setGettingCall(false);
        connecting.current = false;
        setIsAudioCall(false);
        const callId = myId && targetId ? `${myId}_${targetId}` : "chatId";
        const incomingCallId = myId && targetId ? `${targetId}_${myId}` : "chatId";
        const cref = firestore().collection("meet").doc(callId);
        const incomingCref = firestore().collection("meet").doc(incomingCallId);

        if (callStartTime.current && myId && isEnabled) {
            const endTime = Date.now();
            const duration = Math.floor((endTime - callStartTime.current) / 1000);
            const callType = isAudioCall ? "audio" : "video";
            const otherUserId = targetId;

            const historyDoc = {
                otherUserId,
                startTime: firestore.Timestamp.fromMillis(callStartTime.current),
                endTime: firestore.Timestamp.fromMillis(endTime),
                duration,
                callType,
            };

            await firestore()
                .collection("meet")
                .doc(myId)
                .collection("callHistory")
                .add(historyDoc)
                .then(() => console.log("Call history saved:", historyDoc))
                .catch(error => console.error("Failed to save call history:", error));
            callStartTime.current = null;
        }

        // Set hangup signal and clean up synchronously
        await Promise.all([
            cref.set({ hangup: true }, { merge: true }).catch(error => console.error("Failed to set hangup (outgoing):", error)),
            incomingCref.set({ hangup: true }, { merge: true }).catch(error => console.error("Failed to set hangup (incoming):", error))
        ]);

        await streamCleanup();
        if (pc.current) {
            pc.current.close();
            pc.current = new RTCPeerConnection(configuration);
        }

        await Promise.all([
            firestoreCleanup(callId),
            firestoreCleanup(incomingCallId)
        ]).then(() => console.log("Firestore cleanup completed"))
            .catch(error => console.error("Firestore cleanup failed:", error));
    };

    //all stream cleanup functions
    const streamCleanup = async () => {
        const stopTracks = (mediaStream: MediaStream) => {
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => {
                    track.stop();
                });
            }
        };
        stopTracks(stream!)
        stopTracks(localStream!)
        stopTracks(remoteStream!)

        if (pc.current) {
            pc.current?.getSenders().forEach(sender => {
                if (sender.track) sender.track.stop();
                pc.current?.removeTrack(sender);
            });
        }
        stream = null;
        setLocalStream(null);
        setRemoteStream(null);
    };
    //Firestore data clear or delete function
    const firestoreCleanup = async (callId: string) => {
        const cref = firestore().collection("meet").doc(callId);

        try {
            const [callerCandidates, calleeCandidates] = await Promise.all([
                cref.collection(myId || "caller").get(),
                cref.collection(targetId || "callee").get()
            ]);
            const deletePromises = [
                ...callerCandidates.docs.map(candidate => candidate.ref.delete()),
                ...calleeCandidates.docs.map(candidate => candidate.ref.delete()),
                cref.delete()
            ];
            await Promise.all(deletePromises);
        } catch (error) {
            console.error("Firestore cleanup error:", error);
        }

    }
    //Save id on button
    const saveId = async () => {
        if (myId.length !== 5 || !/^\d+$/.test(myId)) {
            Alert.alert('Error', 'ID must be a 5-digit number');
            return;
        }
        try {
            await firestore().collection('users').doc(`user_${myId}`).set({
                id: myId,
                timestamp: firestore.FieldValue.serverTimestamp(),
            });
            await AsyncStorage.setItem('myId', myId);
            setShowInput(false);
            fetchUsers(myId);
            Alert.alert('Success', `ID ${myId} saved`);
        } catch (error) {
            Alert.alert('Error', 'Failed to save ID: ' + error);
        }
    };

    //render users list
    const renderUser = ({ item }: { item: User }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => navigation.navigate('Chat', { myId, targetId: item.id })}
        >
            <Text style={styles.userText}>{item.id}</Text>
        </TouchableOpacity>
    );

    // fetch history button
    const fetchCallHistory = async () => {
        if (!myId) {
            Alert.alert('Error', 'Please enter your ID first');
            return;
        }

        try {
            const historySnapshot = await firestore()
                .collection("meet")
                .doc(myId)
                .collection("callHistory")
                .orderBy("startTime", "desc")
                .get();

            const historyList = historySnapshot.docs.map(doc => {
                const data = doc.data();
                const durationSeconds = data.duration;
                const hours = Math.floor(durationSeconds / 3600);
                const minutes = Math.floor((durationSeconds % 3600) / 60);
                const seconds = durationSeconds % 60;
                const durationString = hours > 0
                    ? `${hours}h ${minutes}m ${seconds}s`
                    : `${minutes}m ${seconds}s`;

                return {
                    id: doc.id,
                    otherUserId: data.otherUserId,
                    startTime: data.startTime.toDate().toLocaleString(),
                    duration: durationString,
                    callType: data.callType,
                };
            });

            setCallHistory(historyList);
            setShowHistory(true);
        } catch (error) {
            console.error("Failed to fetch call history:", error);
            Alert.alert('Error', 'Could not load call history');
        }
    };

    //helper function
    const collectIceCandidates = async (
        cref: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
        localName: string,
        remoteName: string
    ) => {
        const candidateCollection = cref.collection(localName);
        if (pc.current) {
            (pc.current as any).onicecandidate = (event: any) => {
                if (event.candidate) {
                    candidateCollection.add(event.candidate)
                        .catch(error => console.error("Failed to add ICE candidate:", error));
                }
            };
        }
        return () => {
            cref.collection(remoteName).onSnapshot(snapshot => {
                snapshot.docChanges().forEach((change: any) => {
                    if (change.type === "added") {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        if (pc.current && pc.current.remoteDescription) {
                            pc.current.addIceCandidate(candidate)
                                .catch(error => console.error("Failed to apply ICE candidate:", error));
                        } else {
                            console.warn("Skipping ICE candidate: remote description not set yet");
                        }
                        // pc.current?.addIceCandidate(candidate).catch(error => console.error("Failed to apply ICE candidate:", error));
                    }
                });
            });
        }

    };

    //displays the call button 
    return (
        //new code
        <View style={styles.container}>
            {showInput ? (
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter your 5-digit ID"
                        value={myId}
                        onChangeText={setMyId}
                        keyboardType="numeric"
                        maxLength={5}
                    />
                    <TouchableOpacity style={styles.saveButton} onPress={saveId}>
                        <Text style={styles.buttonText}>Save ID</Text>
                    </TouchableOpacity>
                </View>
            )
                : users.length === 0 ? (
                    <View style={styles.noUsersContainer}>
                        <Text style={styles.noUsersText}>No users are found</Text>
                    </View>
                )
                    : (
                        <FlatList
                            data={users}
                            renderItem={renderUser}
                            keyExtractor={item => item.id}
                            ListHeaderComponent={<Text style={styles.header}>Users List</Text>}
                        />
                    )}
        </View>

    );
}
const styles = StyleSheet.create({
    sectionContainer: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: '600',
    },
    sectionDescription: {
        marginTop: 8,
        fontSize: 18,
        fontWeight: '400',
    },
    highlight: {
        fontWeight: '700',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    input: {
        borderWidth: 1,
        padding: 10,
        marginBottom: 10,
        borderRadius: 5,
    },
    historyContainer: {
        marginTop: 20,
        flex: 1,
    },
    historyItem: {
        padding: 10,
        borderWidth: 1,
        borderRadius: 5,
        marginVertical: 5,
        backgroundColor: '#f9f9f9',
    },
    userItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#ccc' },
    userText: { fontSize: 16 },
    container: { flex: 1, padding: 10, backgroundColor: '#fff' },
    inputContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    saveButton: { backgroundColor: '#007AFF', padding: 10, borderRadius: 5 },
    buttonText: { color: '#fff', fontSize: 16 },
    header: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
    noUsersContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    noUsersText: { fontSize: 18, color: '#666' },
}); 
