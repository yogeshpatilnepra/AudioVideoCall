import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MediaStream } from "react-native-webrtc";
import Button from "./Button";

interface Props {
    hangup: () => void;
    remoteStream?: MediaStream | null;
}
function ButtonContainer(props: Props) {
    return (
        <View style={styles.bContainer}>
            <Button iconName="phone"
                backgroundColor="red"
                onPress={props.hangup}
                style={{ marginLeft: 30 }} />
        </View>
    )
}

export default function AudioCallScreen(props: Props) {
    const [callDuration, setCallDuration] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCallDuration(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    //on call we will just display the local stream
    return (
        <View style={styles.container}>
            <Text style={styles.callText}>Audio Call</Text>
            <Text style={styles.timer}>{formatTime(callDuration)}</Text>
            <ButtonContainer hangup={props.hangup} />
        </View>
    );
}
const styles = StyleSheet.create({
    bContainer: {
        flexDirection: 'row',
        bottom: 30
    },
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    callText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 10,
    },
    timer: {
        fontSize: 18,
        color: 'white',
        marginBottom: 20,
    }
})