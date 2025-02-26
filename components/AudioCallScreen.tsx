import { View } from "react-native"
import Button from "./Button"
import { MediaStream } from "react-native-webrtc";
import { StyleSheet } from "react-native";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

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
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if(props.remoteStream){
            timerRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        
        return () => {
            if(timerRef.current){
                clearInterval(timerRef.current);  
            }
        }
    }, [props.remoteStream]);

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
    video: {
        position: 'absolute',
        width: '100%',
        height: '100%'
    },
    videoLocal: {
        position: 'absolute',
        width: 100,
        height: 150,
        top: 0,
        left: 20,
        elevation: 10
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