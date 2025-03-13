import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
// import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const SplashScreen = () => {
    const navigation = useNavigation();

    const checkPermissions = async () => {
        const status = await checkPermissions(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
        if (status !== RESULTS.GRANTED) {
            const requestStatus = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
            if (requestStatus !== RESULTS.GRANTED) {
                Alert.alert(
                    'Permission Required',
                    'Storage permission is needed to proceed.',
                    [{ text: 'Grant Permission', onPress: () => checkPermissions() }],
                    { cancelable: false }
                );
            }
        }
    };

    const handleStart = () => {
        // Navigate to Dashboard
        navigation.navigate('CallScreen');
    };
    return (
        <View style={styles.container}>
            <View style={styles.topSection}>
                {/* <Image source={require('./assets/ocr.png')} style={styles.logo} /> */}
                <Text style={styles.title}>Audio Video Call</Text>
            </View>

            <View style={styles.bottomSection}>
                <Text style={styles.scanDescription}>
                   Start Audio and Video call.
                </Text>
                <TouchableOpacity style={styles.startButton} onPress={handleStart}>
                    <Text style={styles.startButtonText}>Let's Start</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        padding: 15,
        justifyContent: 'space-between',
    },
    topSection: {
        alignItems: 'center',
        marginTop: 50,
    },
    logo: {
        width: 100,
        height: 100,
        tintColor: '#00C569',
    },
    title: {
        fontSize: 25,
        fontWeight: 'bold',
        marginTop: 10,
    },
    bottomSection: {
        alignItems: 'center',
        marginBottom: 30,
    },
    scanDescription: {
        textAlign: 'center',
        fontSize: 18,
        color: '#6e6e6e',
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    startButton: {
        marginTop: 10,
        backgroundColor: '#2E90FA',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    startButtonText: {
        color: '#ffffff',
        fontSize: 22,
        textAlign: 'center',
    },
})

export default SplashScreen;