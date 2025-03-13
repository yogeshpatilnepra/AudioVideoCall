import firestore from '@react-native-firebase/firestore';
import { RouteProp } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { Button, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { RootStackParamList } from "../App";
import Icon from 'react-native-vector-icons/FontAwesome5';
import { FlatList } from 'react-native';
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

const ChatScreen = ({ route }: ChatScreenProps) => {
    const { myId, targetId } = route.params;
    const [message, setMessage] = useState<string>('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const chatRoomId = [myId, targetId].sort().join('_');

    //
    const [unreadCount, setUnreadCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);
    // const flatListRef = useRef<FlatList<ChatMessage> | null>(null);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        const fetchInitialMessages = async () => {
            const snapshot = await firestore()
                .collection('meet')
                .doc(chatRoomId)
                .collection('messages')
                .orderBy('timestamp', 'asc')
                .get();
            const initialMessages = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    text: data.text,
                    senderId: data.senderId,
                    timestamp: data.timestamp || null,
                };
            });
            setMessages(initialMessages);

        }
        fetchInitialMessages();

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
                if (isAtBottom && chatMessages.length > 0) {
                    flatListRef.current?.scrollToEnd({ animated: false });
                }
            });
        return () => {
            subscriber()
        };
    }, [chatRoomId, isAtBottom]);


    // Handle scroll to detect if user is at bottom
    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const isBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 50;
        setIsAtBottom(isBottom);
        if (isBottom && unreadCount > 0) {
            setUnreadCount(0); // Reset when user reaches bottom
        }
    };

    // Update unread count for new messages
    useEffect(() => {
        if (!isAtBottom && messages.length > 0) {
            const newMessages = messages.slice(-unreadCount - 1).filter(msg => msg.senderId !== myId);
            setUnreadCount(prev => prev + newMessages.length);
        }
    }, [messages.length,myId]);

    // Scroll to bottom on arrow click
    const scrollToBottom = () => {
        flatListRef.current?.scrollToEnd({ animated: true });
        setUnreadCount(0);
    };

    const sendMessage = async () => {
        if (!message.trim()) return;

        try {
            const messageRef = await firestore()
                .collection('meet')
                .doc(chatRoomId)
                .collection('messages')
                .add({
                    text: message,
                    senderId: myId,
                    timestamp: firestore.FieldValue.serverTimestamp(),
                });
            setMessage('');
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

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={90}
        >
            <FlatList
                data={messages}
                renderItem={renderMessage}
                style={styles.messageList}
                extraData={messages}
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
                    placeholderTextColor="#000"
                    multiline
                    onChangeText={setMessage} />
                <Button title="Send" onPress={sendMessage} color="#007AFF" />
                {unreadCount > 0 && (
                    <TouchableOpacity style={styles.arrowButton} onPress={scrollToBottom}>
                        <Icon name="arrow-down" size={20} color="#fff" />
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{unreadCount}</Text>
                        </View>
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
        backgroundColor: '#007AFF',
        borderRadius: 25,
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
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
})
export default ChatScreen;

function useRef<T>(arg0: null) {
    throw new Error('Function not implemented.');
}
