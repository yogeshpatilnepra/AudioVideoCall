import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { RouteProp, useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus, FlatList, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Sound from 'react-native-sound';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { RootStackParamList } from "../App";
import AudioCallScreen from '../components/AudioCallScreen';
import CustomButton from '../components/Button';
import GettingCall from '../components/GettingCall';
import Utils from '../components/Utils';
import Video from '../components/Video';
import { ActivityIndicator } from 'react-native';

interface ChatMessage {
    id: string;
    text: string;
    senderId: string;
    timestamp: any;
}

interface ChatScreenProps {
    route: RouteProp<RootStackParamList, 'Chat'>;
    navigation: any; // Refine if needed
}

const configuration = {
    "iceServers": [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

const ChatScreen = ({ route }: ChatScreenProps) => {
    const { myId, targetId } = route.params;
    const [message, setMessage] = useState<string>('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const chatRoomId = [myId, targetId].sort().join('_');

    //
    const [unreadCount, setUnreadCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

    //new code
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [gettingCall, setGettingCall] = useState(false);
    const [isAudioCall, setIsAudioCall] = useState(false);
    const pc = useRef<RTCPeerConnection>(
        new RTCPeerConnection()
    );
    const connecting = useRef(false);
    let stream: MediaStream | null = null;

    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const callStartTime = useRef<number | null>(null);

    //switch
    const [isEnabled, setIsEnabled] = useState(false);
    const toggleSwitch = () => setIsEnabled(previousState => !previousState);

    const flatListRef = useRef<FlatList<any> | null>(null);

    const cleanupTimeout = useRef<NodeJS.Timeout | null>(null);

    //ringne code
    const ringtoneRef = useRef<Sound | null>(null);
    const ringingToneRef = useRef<Sound | null>(null);
    const [isCleaningUp, setIsCleaningUp] = useState(false);

    useEffect(() => {
        Sound.setCategory('Playback', true);
        const ringingTone = new Sound('ringtone.mp3', Sound.MAIN_BUNDLE, (error) => {
            if (error) {
                console.error('Failed to load ringing tone:', error);
                return;
            }
            ringingTone.setVolume(0.5); // Adjust volume as needed
            ringingToneRef.current = ringingTone;
        });

        return () => {
            if (ringingToneRef.current) {
                ringingToneRef.current.stop(() => ringingToneRef.current!.release());
            }
        };
    }, []);

    useEffect(() => {
        Sound.setCategory('Playback', true); // iOS category for playback
        const ringtone = new Sound('ringtone.mp3', Sound.MAIN_BUNDLE, (error) => {
            if (error) {
                console.error('Failed to load ringtone:', error);
                return;
            }
            ringtone.setVolume(1.0); // Full volume
            ringtoneRef.current = ringtone;
        });

        return () => {
            if (ringtoneRef.current) {
                ringtoneRef.current.stop(() => ringtoneRef.current!.release());
            }
        };
    }, []);

    useEffect(() => {
        const handleAppStateChange = async (nextAppState: AppStateStatus) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                const callId = `${myId}_${targetId}`;
                const incomingCallId = `${targetId}_${myId}`;
                await Promise.all([
                    firestore().collection('meet').doc(callId).set({ hangup: true }, { merge: true }),
                    firestore().collection('meet').doc(incomingCallId).set({ hangup: true }, { merge: true }),
                ]).catch(error => console.error('Failed to signal hangup:', error));
                await hangup(); // Ensure local cleanup
            }
        };
        const subscription = AppState.addEventListener('change', handleAppStateChange);

        //new code for audio and video call
        if (!myId || !targetId) return;
        const callId = `${targetId}_${myId}`; // Incoming call
        const outgoingCallId = `${myId}_${targetId}`; // Outgoing call
        const cref = firestore().collection("meet").doc(callId);
        const outgoingCref = firestore().collection("meet").doc(outgoingCallId);

        const subscribe = cref.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (data && data.offer && data.targetId === myId && !connecting.current) {
                setGettingCall(true);

                if (ringtoneRef.current) {
                    ringtoneRef.current.setNumberOfLoops(-1); // Loop indefinitely
                    ringtoneRef.current.play((success) => {
                        if (!success) console.error('Ringtone playback failed');
                    });
                }
            }
            if (snapshot.exists && data?.hangup) {
                hangup();
            }
        });

        const subscribeOutgoing = outgoingCref.onSnapshot(snapshot => {
            if (snapshot.exists && snapshot.data()?.hangup) {
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

        const subscriber = firestore()
            .collection('meet')
            .doc(chatRoomId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                const chatMessages = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        text: data.text,
                        senderId: data.senderId,
                        timestamp: data.timestamp || null,
                    };
                });
                setMessages(chatMessages);
                // If at bottom, scroll to end automatically
                // if (isAtBottom && chatMessages.length > 0) {
                //     flatListRef.current?.scrollToEnd({ animated: false });
                // }
            });

        return () => {
            subscription.remove();
            subscriber();
            subscribe();
            subscribeOutgoing();
            subscrbeDelete();
            if (ringtoneRef.current) ringtoneRef.current.stop();
        };
    }, [chatRoomId, isAtBottom, myId, targetId]);

    //set up a webrtc connection between the peer connections
    const setupWebrtc = async (audioOnly = false) => {
        if (pc.current) {
            pc.current.close();
            pc.current = new RTCPeerConnection(configuration);
        }
        await streamCleanup();

        stream = audioOnly ? await Utils.getAudioStream() : await Utils.getStream();
        if (!stream) throw new Error("Failed to get stream");
        setLocalStream(stream);
        stream.getTracks().forEach(track => {
            pc.current?.addTrack(track, stream!);
        });

        (pc.current as any).ontrack = (event: any) => {
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
            if (pc.current) {
                pc.current.close();
                pc.current = new RTCPeerConnection(configuration);
            }
            await streamCleanup();
            const stream = await Utils.getStream();
            if (!stream) throw new Error('Failed to get stream');
            setLocalStream(stream);
            stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
            (pc.current as any).ontrack = (event: any) => setRemoteStream(event.streams[0]);
            callStartTime.current = Date.now();
            const callId = `${myId}_${targetId}`;
            const cref = firestore().collection("meet").doc(callId);

            if (ringingToneRef.current) {
                ringingToneRef.current.setNumberOfLoops(-1);
                ringingToneRef.current.play((success) => {
                    if (!success) console.error('Ringing tone playback failed');
                });
            }


            // Ensure previous call is fully cleaned up
            await cref.delete().catch(() => { });
            await cref.set({ hangup: false }, { merge: true });

            const startRemoteCandidates = await collectIceCandidates(cref, myId, targetId);
            const offer = await pc.current.createOffer({});
            await pc.current.setLocalDescription(offer);
            await cref.set({
                offer: { type: offer.type, sdp: offer.sdp },
                callType: 'video',
                callerId: myId,
                targetId,
                hangup: false,
            });
            const doc = await cref.get();
            if (!doc.data()?.offer) {
                throw new Error("Offer verification failed");
            }

            const unsubscribe = cref.onSnapshot(snapshot => {
                const data = snapshot.data();
                if (data?.answer && !pc.current.remoteDescription) {
                    pc.current.setRemoteDescription(new RTCSessionDescription(data.answer))
                        .then(() => {
                            startRemoteCandidates();
                            if (ringingToneRef.current) ringingToneRef.current.stop();
                        });
                    unsubscribe();
                }
                if (data?.hangup) {
                    if (ringingToneRef.current) ringingToneRef.current.stop(); // Stop ringing if call ends
                    hangup();
                }
            });

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
            if (pc.current) {
                pc.current.close();
                pc.current = new RTCPeerConnection(configuration);
            }
            await streamCleanup();
            const stream = await Utils.getAudioStream();
            if (!stream) throw new Error('Failed to get stream');
            setLocalStream(stream);
            stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
            (pc.current as any).ontrack = (event: any) => setRemoteStream(event.streams[0]);

            callStartTime.current = Date.now();
            const callId = `${myId}_${targetId}`;
            const cref = firestore().collection("meet").doc(callId);

            // Ensure previous call is fully cleaned up
            await cref.delete().catch(() => { });
            await cref.set({ hangup: false }, { merge: true });

            // Start ringing tone on User1's side
            if (ringingToneRef.current) {
                ringingToneRef.current.setNumberOfLoops(-1);
                ringingToneRef.current.play((success) => {
                    if (!success) console.error('Ringing tone playback failed');
                });
            }

            const startRemoteCandidates = await collectIceCandidates(cref, myId, targetId);
            const offer = await pc.current.createOffer({});
            await pc.current.setLocalDescription(offer);
            await cref.set({
                offer: { type: offer.type, sdp: offer.sdp },
                callType: 'audio',
                callerId: myId,
                targetId,
                hangup: false,
            });
            const doc = await cref.get();
            if (!doc.data()?.offer) {
                throw new Error("Offer verification failed");
            }

            const unsubscribe = cref.onSnapshot(snapshot => {
                const data = snapshot.data();
                if (data?.answer && !pc.current.remoteDescription) {
                    pc.current.setRemoteDescription(new RTCSessionDescription(data.answer))
                        .then(() => {
                            startRemoteCandidates();
                            if (ringingToneRef.current) ringingToneRef.current.stop();
                        });
                    unsubscribe();
                }
                if (data?.hangup) {
                    if (ringingToneRef.current) ringingToneRef.current.stop(); // Stop ringing if call ends
                    hangup();
                }
            });

        } catch (error) {
            console.error("Error in audioCall:", error.message || error);
            await hangup();
            Alert.alert("Error", "Failed to start audio call: " + error.message);
        }
    };

    //call join or accept function
    const join = async () => {
        connecting.current = true;
        setGettingCall(false);
        if (ringtoneRef.current) ringtoneRef.current.stop();
        const callId = `${targetId}_${myId}`;
        const cref = firestore().collection("meet").doc(callId);

        // Retry logic to wait for offer
        const waitForOffer = async (maxRetries = 10, delayMs = 1000) => {
            for (let i = 0; i < maxRetries; i++) {
                const doc = await cref.get();
                const offer = doc.data()?.offer;
                if (offer) return { offer, callType: doc.data()?.callType || "video" };
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            throw new Error("Offer not found after retries");
        };

        try {
            if (pc.current) {
                pc.current.close();
                pc.current = new RTCPeerConnection(configuration);
            }
            await streamCleanup();

            const { offer, callType } = await waitForOffer();
            const isAudioOnly = callType === "audio";
            setIsAudioCall(isAudioOnly);

            const stream = isAudioOnly ? await Utils.getAudioStream() : await Utils.getStream();
            if (!stream) throw new Error('Failed to get stream');
            setLocalStream(stream);
            stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
            (pc.current as any).ontrack = (event: any) => {
                setRemoteStream(event.streams[0]);
            };

            callStartTime.current = Date.now();
            const startRemoteCandidates = await collectIceCandidates(cref, myId, targetId);

            await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            const cWithAnswer = {
                answer: { type: answer.type, sdp: answer.sdp },
                hangup: false
            };
            await cref.update(cWithAnswer)
                .then(() => { })
                .catch(error => console.error("Failed to update answer:", error));
            startRemoteCandidates();
        } catch (error) {
            console.error("Error in join:", error || error);
            connecting.current = false;
            await hangup();
            Alert.alert("Error", "Failed to join call: Offer not found");
        }
    };

    //call end function
    const hangup = async () => {
        setGettingCall(false);
        connecting.current = false;
        setIsAudioCall(false);
        const callId = `${myId}_${targetId}`;
        const incomingCallId = `${targetId}_${myId}`;

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
                .then(() => { })
                .catch(error => console.error("Failed to save call history:", error));
            callStartTime.current = null;
        }

        // Set hangup signal and clean up synchronously
        // Signal hangup only once
        await Promise.all([
            firestore().collection('meet').doc(callId).set({ hangup: true }, { merge: true }),
            firestore().collection('meet').doc(incomingCallId).set({ hangup: true }, { merge: true }),
        ]).catch(error => console.error('Failed to set hangup:', error));

        await streamCleanup();
        if (pc.current) {
            pc.current.close();
            pc.current = new RTCPeerConnection(configuration);
        }
        if (ringtoneRef.current) ringtoneRef.current.stop();
        if (ringingToneRef.current) ringingToneRef.current.stop();
        if (cleanupTimeout.current)
            clearTimeout(cleanupTimeout.current);
        // cleanupTimeout.current = setTimeout(async () => {
        //     await Promise.all([
        //         // firestoreCleanup(callId),
        //         // firestoreCleanup(incomingCallId)
        //     ])
        // }, 500);
        await cleanupFirestore();
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
        setIsCleaningUp(true);
        const cref = firestore().collection("meet").doc(callId);
        try {
            const [callerCandidates, calleeCandidates] = await Promise.all([
                cref.collection(myId || "caller").get(),
                cref.collection(targetId || "callee").get()
            ]);
            const deletePromises = [];
            callerCandidates.docs.map(doc => deletePromises.push(doc.ref.delete()));
            calleeCandidates.docs.map(doc => deletePromises.push(doc.ref.delete()));
            deletePromises.push(cref.delete());
            await Promise.all(deletePromises);
        } catch (error) {
            console.error("Firestore cleanup error:", error);
        }
    }

    const cleanupFirestore = async () => {
        setIsCleaningUp(true);
        const callId = `${myId}_${targetId}`; // Outgoing call
        const incomingCallId = `${targetId}_${myId}`; // Incoming call
        const cref = firestore().collection('meet').doc(callId);
        const incomingCref = firestore().collection('meet').doc(incomingCallId);

        try {
            // Delete ICE candidates subcollections
            const deleteCandidates = async (docRef: any, collectionName: string) => {
                const candidates = await docRef.collection(collectionName).get();
                const batch = firestore().batch();
                candidates.docs.forEach((doc: { ref: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>; }) => batch.delete(doc.ref));
                await batch.commit();
            };

            // Clean up both directions
            await Promise.all([
                deleteCandidates(cref, myId),
                deleteCandidates(cref, targetId),
                deleteCandidates(incomingCref, myId),
                deleteCandidates(incomingCref, targetId),
            ]);

            // Delete main call documents
            await Promise.all([
                cref.delete(),
                incomingCref.delete(),
            ]);
        } catch (error) {
            console.error('Cleanup error:', error);
        } finally {
            setIsCleaningUp(false);
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
                    }
                });
            });
        }
    };

    // Handle scroll to detect if user is at bottom
    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const isBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 50;
        setIsAtBottom(isBottom);
        if (!isBottom && unreadCount > 0) {
            setUnreadCount(messages.length - Math.floor(contentOffset.y / 50));
        } else {
            setUnreadCount(0);
        }
    };

    // Update unread count for new messages
    useEffect(() => {
        if (!isAtBottom && messages.length > 0) {
            const newMessages = messages.slice(-unreadCount - 1).filter(msg => msg.senderId !== myId);
            setUnreadCount(newMessages.length);
        }
    }, [messages.length, myId]);

    // Scroll to bottom on arrow click
    const scrollToBottom = () => {
        if (flatListRef.current) {
            flatListRef.current?.scrollToEnd({ animated: true });
        }
        setUnreadCount(0);
    };

    const sendMessage = async () => {
        if (!message.trim()) return;

        try {
            await firestore()
                .collection('meet')
                .doc(chatRoomId)
                .collection('messages')
                .add({
                    text: message,
                    senderId: myId,
                    timestamp: firestore.FieldValue.serverTimestamp(),
                });
            setMessage('');
            flatListRef.current?.scrollToEnd({ animated: true });
        }
        catch (error) {
            console.error('Failed to send message', error);
        }
    };

    const renderMessage = ({ item }: { item: ChatMessage }) => {
        const isMyMessage = item.senderId === myId;
        return (
            <View style={[styles.messageContainer, isMyMessage ? styles.myMessage : styles.theirMessage]}>
                <Text style={styles.messageText}>{item.text}</Text>
                <Text style={styles.timestamp}>
                    {item.timestamp ? item.timestamp.toDate().toLocaleTimeString() : 'Sending...'}
                </Text>
            </View>
        )
    }

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

    if (isCleaningUp) {
        return (
            <View style={styles.loadingContainer}>
                 <ActivityIndicator size="large" color="#007AFF" />
                 <Text style={styles.loadingText}>Please wait...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-left" size={24} color="#000" />
                </TouchableOpacity>
                <Text style={styles.targetIdText}>{targetId}</Text>
                <View style={styles.buttonContainer}>
                    <CustomButton
                        onPress={create}
                        iconName="video-camera"
                        backgroundColor="#007AFF"
                        style={{ justifyContent: 'flex-end' }}
                    />
                    <CustomButton
                        onPress={audioCall}
                        iconName="phone"
                        backgroundColor="#007AFF"
                        style={{ marginTop: 0, marginLeft: 10, justifyContent: 'flex-end' }}
                    />
                </View>
            </View>

            <FlatList
                data={messages}
                renderItem={renderMessage}
                style={styles.messageList}
                ref={flatListRef}
                keyExtractor={item => item.id}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingVertical: 10 }}
            />


            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.textInput}
                    value={message}
                    placeholder="Type a message..."
                    placeholderTextColor="#999"
                    multiline
                    onChangeText={setMessage} />
                <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
                    <Icon name="paper-plane" size={20} color="#fff" />
                </TouchableOpacity>
                {!isAtBottom && (
                    <TouchableOpacity style={styles.arrowButton} onPress={scrollToBottom}>
                        <Icon name="arrow-down" size={20} color="#fff" />
                        {unreadCount > 0 &&
                            (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{unreadCount}</Text>
                                </View>
                            )
                        }

                    </TouchableOpacity>
                )}

            </View>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    messageList: {
        flex: 1,
    },
    messageContainer: {
        marginVertical: 5,
        marginHorizontal: 10,
        padding: 10,
        borderRadius: 8,
        maxWidth: '80%',
    },
    myMessage: {
        backgroundColor: '#007AFF',
        alignSelf: 'flex-end',
    },
    theirMessage: {
        backgroundColor: '#2E90FA',
        alignSelf: 'flex-start',
    },
    messageText: {
        color: '#fff',
        fontSize: 16,
    },
    timestamp: {
        fontSize: 12,
        color: '#fff',
        opacity: 0.7,
        marginTop: 2,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#ccc',
        alignItems: 'center',
    },
    textInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        marginRight: 10,
        backgroundColor: '#fff',
        maxHeight: 100
    },
    arrowButton: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'red',
        borderRadius: 25,
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 50
    }, badge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: 'red',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: { color: '#fff', fontSize: 12 },
    headerButtons: {
        flexDirection: 'row',
        marginRight: 10,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    backButton: {
        padding: 5,
    },
    targetIdText: {
        flex: 1,
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    sendButton: {
        backgroundColor: '#007AFF',
        height: 45,
        borderRadius: 100,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FAFAFA',
    },
    loadingText: {
        fontSize: 18,
        color: '#00796B',
        fontWeight: 'bold',
    },
})
export default ChatScreen;
