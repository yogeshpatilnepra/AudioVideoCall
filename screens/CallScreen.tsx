
import {
    Alert,
    StyleSheet,
    TextInput,
    View
} from 'react-native';

import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { NavigationProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Button, FlatList, Switch, Text, TouchableOpacity } from 'react-native';
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { RootStackParamList } from '../App';
import AudioCallScreen from '../components/AudioCallScreen';
import CustomButton from '../components/Button';
import CustomButtonNew from '../components/CustomButton';
import GettingCall from '../components/GettingCall';
import Utils from '../components/Utils';
import Video from '../components/Video';

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

    useEffect(() => {
        if (!myId || !targetId) return;

        const callId = `${targetId}_${myId}`; // Incoming call
        const outgoingCallId = `${myId}_${targetId}`; // Outgoing call
        const cref = firestore().collection("meet").doc(callId);
        const outgoingCref = firestore().collection("meet").doc(outgoingCallId);

        const subscribe = cref.onSnapshot(snapshot => {
            const data = snapshot.data();
            console.log("Snapshot data for incoming callId:", callId, data);
            if (data && data.offer && data.targetId === myId && !connecting.current) {
                console.log("Incoming call detected for", myId, "with offer:", data.offer);
                setGettingCall(true);
            }
            if (snapshot.exists && data?.hangup) {
                console.log("Detected hangup signal from Firestore (incoming)");
                hangup();
            }
        });

        const subscribeOutgoing = outgoingCref.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (snapshot.exists && data?.hangup) {
                console.log("Detected hangup signal from Firestore (outgoing)");
                hangup();
            }
        });

        const subscrbeDelete = cref.collection(myId).onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === "removed") {
                    console.log("OTHERUSERENDBUTTONCALL");
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

    //set up a webrtc connection between the peer connections
    const setupWebrtc = async (audioOnly = false) => {
        if (pc.current) {
            pc.current.close();
            pc.current = new RTCPeerConnection(configuration);
        }
        if (localStream || remoteStream || stream) {
            await streamCleanup();
        }

        stream = audioOnly ? await Utils.getAudioStream() : await Utils.getStream();
        if (!stream) {
            throw new Error("Failed to get stream");
        }
        setLocalStream(stream);
        stream.getTracks().forEach(track => {
            console.log("Adding track:", track.kind);
            pc.current?.addTrack(track, stream!);
        });

        (pc.current as any).ontrack = (event: any) => {
            console.log("Received remote stream:", event.streams[0]);
            setRemoteStream(event.streams[0]);
        };
    };

    //video call only 
    const create = async () => {
        if (myId.length !== 5 || targetId.length !== 5 || !/^\d+$/.test(myId) || !/^\d+$/.test(targetId)) {
            Alert.alert('Error', 'Both IDs must be 5-digit numbers');
            return;
        }

        connecting.current = true;
        setIsAudioCall(false);
        try {
            await setupWebrtc();
            callStartTime.current = Date.now();
            const callId = `${myId}_${targetId}`;
            const cref = firestore().collection("meet").doc(callId);

            // Ensure previous call is fully cleaned up
            await cref.delete().catch(() => console.log("No previous call doc to delete"));
            await cref.set({ hangup: false }, { merge: true });

            const startRemoteCandidates = await collectIceCandidates(cref, myId, targetId);
            if (pc.current) {
                const offer = await pc.current.createOffer({});
                await pc.current.setLocalDescription(offer);
                const cWithOffer = {
                    offer: { type: offer.type, sdp: offer.sdp },
                    callType: "video",
                    callerId: myId,
                    targetId: targetId,
                    hangup: false
                };
                console.log("Setting offer for callId:", callId, cWithOffer);
                await cref.set(cWithOffer)
                    .then(() => console.log("Offer successfully written to Firestore"))
                    .catch(error => { throw new Error("Failed to write offer: " + error.message); });

                const doc = await cref.get();
                if (!doc.data()?.offer) {
                    throw new Error("Offer verification failed");
                }

                const unsubscribe = cref.onSnapshot(snapshot => {
                    const data = snapshot.data();
                    if (data && data.answer && !pc.current.remoteDescription) {
                        console.log("Setting remote answer:", data.answer);
                        pc.current.setRemoteDescription(new RTCSessionDescription(data.answer))
                            .then(() => {

                                startRemoteCandidates();
                            
                            });
                        unsubscribe();
                    }
                });
            }
        } catch (error) {
            console.error("Error in create:", error.message || error);
            await hangup();
            Alert.alert("Error", "Failed to start video call: " + error.message);
        }
    };

    //for audio call only
    const audioCall = async () => {
        if (myId.length !== 5 || targetId.length !== 5 || !/^\d+$/.test(myId) || !/^\d+$/.test(targetId)) {
            Alert.alert('Error', 'Both IDs must be 5-digit numbers');
            return;
        }

        connecting.current = true;
        setIsAudioCall(true);
        try {
            await setupWebrtc(true);
            callStartTime.current = Date.now();
            const callId = `${myId}_${targetId}`;
            const cref = firestore().collection("meet").doc(callId);

            // Ensure previous call is fully cleaned up
            await cref.delete().catch(() => console.log("No previous call doc to delete"));
            await cref.set({ hangup: false }, { merge: true });

            const startRemoteCandidates = await collectIceCandidates(cref, myId, targetId);
            if (pc.current) {
                const offer = await pc.current.createOffer({});
                await pc.current.setLocalDescription(offer);
                const cWithOffer = {
                    offer: { type: offer.type, sdp: offer.sdp },
                    callType: "audio",
                    callerId: myId,
                    targetId: targetId,
                    hangup: false
                };
                // console.log("Setting offer for callId:", callId, cWithOffer);
                await cref.set(cWithOffer)
                    .then(() => console.log("Offer successfully written to Firestore"))
                    .catch(error => { throw new Error("Failed to write offer: " + error.message); });

                const doc = await cref.get();
                if (!doc.data()?.offer) {
                    throw new Error("Offer verification failed");
                }

                const unsubscribe = cref.onSnapshot(snapshot => {
                    const data = snapshot.data();
                    if (data && data.answer && !pc.current.remoteDescription) {
                        // console.log("Setting remote answer:", data.answer);
                        pc.current.setRemoteDescription(new RTCSessionDescription(data.answer))
                            .then(() => {

                                startRemoteCandidates();
                            
                            });
                        unsubscribe();
                    }
                });
            }
        } catch (error) {
            // console.error("Error in audioCall:", error.message || error);
            await hangup();
            // Alert.alert("Error", "Failed to start audio call: " + error.message);
        }
    };

    //call join or accept function
    const join = async () => {
        connecting.current = true;
        setGettingCall(false);
        const callId = `${targetId}_${myId}`;
        const cref = firestore().collection("meet").doc(callId);
        console.log("Attempting to join call with callId:", callId);

        // Retry logic to wait for offer
        const waitForOffer = async (maxRetries = 5, delayMs = 1000): Promise<any> => {
            for (let i = 0; i < maxRetries; i++) {
                const doc = await cref.get();
                const offer = doc.data()?.offer;
                if (offer) {
                    console.log("Offer found:", offer);
                    return { offer, callType: doc.data()?.callType || "video" };
                }
                console.log(`Offer not found on attempt ${i + 1}/${maxRetries}, waiting...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            throw new Error("Offer not found after retries");
        };

        try {
            const { offer, callType } = await waitForOffer();
            const isAudioOnly = callType === "audio";
            setIsAudioCall(isAudioOnly);
            await setupWebrtc(isAudioOnly);
            callStartTime.current = Date.now();
            const startRemoteCandidates = await collectIceCandidates(cref, myId, targetId);

            if (pc.current) {
                console.log("Setting remote offer:", offer);
                await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
                startRemoteCandidates();
                const answer = await pc.current.createAnswer();
                await pc.current.setLocalDescription(answer);
                const cWithAnswer = {
                    answer: { type: answer.type, sdp: answer.sdp },
                    hangup: false
                };
                console.log("Updating Firestore with answer:", cWithAnswer);
                await cref.update(cWithAnswer)
                    .then(() => console.log("Answer successfully updated"))
                    .catch(error => console.error("Failed to update answer:", error));
            }
        } catch (error) {
            console.error("Error in join:", error || error);
            connecting.current = false;
            await hangup();
            Alert.alert("Error", "Failed to join call: Offer not found");
        }
    };

    //call end function
    const hangup = async () => {
        console.log("Initiating hangup process");
        setGettingCall(false);
        connecting.current = false;
        setIsAudioCall(false);

        if (ringtone && ringtone.isPlaying()) {
            ringtone.stop(() => console.log('Ringtone stopped on hangup'));
        }

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
        console.log("Hangup signal set for both sides:", callId, incomingCallId);

        await streamCleanup();
        if (pc.current) {
            pc.current.close();
            pc.current = new RTCPeerConnection(configuration);
            console.log("Peer connection closed and reset");
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
                    console.log(`Stopped track: ${track.kind} - ${track.id}`);
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
            console.log("Firestore cleanup completed for:", callId);
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
            await firestore().collection('meet').doc(`user_${myId}`).set({
                id: myId,
                timestamp: firestore.FieldValue.serverTimestamp(),
            });
            Alert.alert('Success', `ID ${myId} saved`);
        } catch (error) {
            Alert.alert('Error', 'Failed to save ID: ' + error);
        }
    };

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

    const startChat = () => {
        if (!myId || !targetId) {
            Alert.alert('Error', 'Please enter both your ID and target ID');
            return;
        }
        navigation.navigate('Chat', { myId, targetId });
    }
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
                    console.log("Adding ICE candidate for", localName, event.candidate);
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
                        console.log("Received ICE candidate from", remoteName, candidate);
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
    //Display the gettingcall component
    if (gettingCall) {
        return <GettingCall hangup={hangup} join={join} />;
    }

    if (localStream) {
        return isAudioCall ? (
            <AudioCallScreen hangup={hangup} localStream={localStream} remoteStream={remoteStream} />
        ) : (
            <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />
        );
    }

    //displays the call button 
    return (
        <View style={styles.sectionContainer}>
            <View style={styles.buttonContainer}>
                <Text style={[{ color: '#000', width: "auto", textAlign: 'center' }]}>
                    Save Call Logs/History
                </Text>
                <Switch
                    style={[{ marginLeft: 30, marginBottom: 10, alignItems: 'center' }]}
                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                    thumbColor={isEnabled ? '#f5dd4b' : '#f4f3f4'}
                    ios_backgroundColor="#3e3e3e"
                    onValueChange={toggleSwitch}
                    value={isEnabled}
                />
            </View>

            <TextInput
                style={styles.input}
                value={myId}
                onChangeText={setMyId}
                placeholder="Enter your 5-digit ID"
                placeholderTextColor="#000"
                keyboardType="numeric"
                maxLength={5}
            />
            <TouchableOpacity onPress={saveId}>
                <Text style={[styles.input, { backgroundColor: "blue", color: '#fff', width: 90, textAlign: 'center' }]}>
                    Save Id
                </Text>
            </TouchableOpacity>
            <TextInput
                style={styles.input}
                value={targetId}
                placeholderTextColor="#000"
                onChangeText={setTargetId}
                placeholder="Enter target 5-digit ID"
                keyboardType="numeric"
                maxLength={5}
            />
            <View style={styles.buttonContainer}>
                <CustomButton iconName='video-camera' onPress={create} backgroundColor='grey' />
                <CustomButton iconName='phone' onPress={audioCall} backgroundColor='grey' style={{ marginTop: 0, marginLeft: 20 }} />
                <CustomButtonNew text='Show History' onPress={fetchCallHistory} style={[{
                    backgroundColor: "blue",
                    color: '#fff',
                    width: "auto",
                    textAlign: 'center',
                    marginLeft: 30,
                    marginTop: 10,
                }]} />
            </View>
            <CustomButtonNew text='Start Chat' onPress={startChat} style={[{
                backgroundColor: "blue",
                color: '#fff',
                width: "auto",
                textAlign: 'center',
                marginLeft: 30,
                marginTop: 10,
            }]} />
            {/* show flatlist */}
            {showHistory && (
                <View style={styles.historyContainer}>
                    <FlatList
                        data={callHistory}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <View style={styles.historyItem}>
                                <Text>User ID: {item.otherUserId}</Text>
                                <Text>Start Time: {item.startTime}</Text>
                                <Text>Duration: {item.duration}</Text>
                                <Text>Type: {item.callType}</Text>
                            </View>
                        )}
                        ListEmptyComponent={<Text>No call history available</Text>}
                    />
                    <Button title="Hide History" onPress={() => setShowHistory(false)} />
                </View>
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
}); 
