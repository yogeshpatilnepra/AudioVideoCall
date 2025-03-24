import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SQLite from 'react-native-sqlite-storage';
import { RootStackParamList } from '../App';

const db = SQLite.openDatabase(
    { name: 'users.db', location: 'default' },
    () => console.log('Database opened successfully'),
    error => console.error('Error opening database:', error)
);

interface User {
    id: string;
    timestamp: any;
}

interface LoginScreenProps {
    navigation: NavigationProp<RootStackParamList, 'LoginScreen'>;
}
export default function LoginScreen({ navigation }: LoginScreenProps) {

    const [myId, setMyId] = useState<string>('');
    const [users, setUsers] = useState<User[]>([]);
    const [showInput, setShowInput] = useState(false);
    const [isFirstTime, setIsFirstTime] = useState<boolean>(true);

    useEffect(() => {
        db.transaction(tx => {
            tx.executeSql(
                'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, timestamp TEXT)',
                [],
                () => console.log('Users table created or already exists'),
                (_, error) => {
                    console.error('Error creating table:', error);
                    return false;
                }
            );
        });

        const loadId = async () => {
            try {
                const savedId = await AsyncStorage.getItem('myId');
                console.log('Loaded myId from AsyncStorage:', savedId);
                if (savedId) {
                    setMyId(savedId);
                    setIsFirstTime(false);
                    fetchUsers(savedId);
                } else {
                    setIsFirstTime(true);
                }
            } catch (error) {
                console.error('Error loading ID from AsyncStorage:', error);
            }
        };
        loadId();
    }, [myId]);

    //fetch users
    const fetchUsers = (currentId: string) => {
        if (!currentId || currentId.length !== 5 || !/^\d+$/.test(currentId)) {
            console.log('Invalid currentId:', currentId);
            return;
        }
        db.transaction(tx => {
            tx.executeSql(
                'SELECT id, timestamp FROM users WHERE id != ?',
                [currentId],
                (_, { rows }) => {
                    const userList: User[] = [];
                    for (let i = 0; i < rows.length; i++) {
                        userList.push(rows.item(i));
                    }
                    console.log('Fetched users for', currentId, ':', userList);
                    setUsers(userList); // Ensure state updates here
                },
                (_, error) => {
                    console.error('Error fetching users:', error);
                    return false;
                }
            );

            tx.executeSql(
                'SELECT id, timestamp FROM users',
                [],
                (_, { rows }) => {
                    const allUsers: User[] = [];
                    for (let i = 0; i < rows.length; i++) {
                        allUsers.push(rows.item(i));
                    }
                    console.log('All users in database:', allUsers);
                },
                (_, error) => console.error('Error fetching all users:', error)
            );

        }, (error) => {
            console.error('Transaction error:', error);
        }, () => {
            console.log('Transaction completed');
        });
    };

    const saveId = async () => {
        if (myId.length !== 5 || !/^\d+$/.test(myId)) {
            Alert.alert('Error', 'ID must be a 5-digit number');
            return;
        }
        db.transaction(tx => {
            tx.executeSql(
                'INSERT OR IGNORE INTO users (id, timestamp) VALUES (?, ?)',
                [myId, new Date().toISOString()],
                async (_, { rowsAffected }) => {
                    console.log('Rows affected by insert:', rowsAffected);
                    if (rowsAffected > 0) {
                        await AsyncStorage.setItem('myId', myId);
                        console.log('Saved myId to AsyncStorage:', myId);
                        setIsFirstTime(false);

                        tx.executeSql(
                            'SELECT id FROM users WHERE id = ?',
                            [myId],
                            (_, { rows }) => console.log('Verified saved ID:', rows.item(0)),
                            (_, error) => console.error('Verification error:', error)
                        );
                        setTimeout(() => fetchUsers(myId), 100); // Small delay to ensure DB update
                        Alert.alert('Success', `ID ${myId} saved`);
                    } else {
                        console.log('No rows affected, insert failed');
                    }
                },
                (_, error) => {
                    Alert.alert('Error', 'Failed to save ID to SQLite: ' + error);
                    console.error('Error saving ID to SQLite:', error);
                    return false;
                }
            );
        });
    };

    const renderUser = ({ item }: { item: User }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => navigation.navigate('Chat', { myId, targetId: item.id })}
        >
            <Text style={styles.userText}>{item.id}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {isFirstTime ? (
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
            ) : users.length === 0 ? (
                <View style={styles.noUsersContainer}>
                    <Text style={styles.noUsersText}>No users are found</Text>
                </View>
            ) : (
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
    container: { flex: 1, padding: 10, backgroundColor: '#fff' },
    inputContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    input: {
        borderWidth: 1,
        padding: 10,
        marginBottom: 10,
        borderRadius: 5,
        width: 200,
    },
    saveButton: { backgroundColor: '#007AFF', padding: 10, borderRadius: 5 },
    buttonText: { color: '#fff', fontSize: 16 },
    userItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#ccc' },
    userText: { fontSize: 16 },
    header: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
    noUsersContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    noUsersText: { fontSize: 18, color: '#666' },
});