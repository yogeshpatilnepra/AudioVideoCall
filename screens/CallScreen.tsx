
import {
    Alert,
    StyleSheet,
    TextInput,
    View
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { NavigationProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Text, TouchableOpacity } from 'react-native';
import { MediaStream, RTCPeerConnection } from 'react-native-webrtc';
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
                fetchUsers(savedId);
            } else {
                setShowInput(true);
            }
        };
        loadId();
    }, []);

    //fetch users
    const fetchUsers = (currentId: string) => {
        if (!currentId || currentId.length !== 5 || !/^\d+$/.test(currentId)) return;
        firestore()
            .collection('users') // Changed from 'meet' to 'users' for clarity
            .onSnapshot(snapshot => {
                if (snapshot && !snapshot.empty) {
                    const userList = snapshot.docs
                        .map(doc => ({
                            id: doc.data().id ,
                            timestamp: doc.data().timestamp
                        }))
                        .filter(user => user.id !== currentId);
                    setUsers(userList);
                    console.log("USERSSS", userList)
                } else {
                    setUsers([]);
                }
            });
    };


    //call end function

    //all stream cleanup functions

    //Firestore data clear or delete function

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
            navigation.navigate('CallScreen', { myId });
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
                            keyExtractor={(item, index) => {
                                return item.id;
                            }}
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
