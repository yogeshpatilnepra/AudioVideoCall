import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import inCallManager from "react-native-incall-manager";
import { MediaStream } from "react-native-webrtc";
import CustomButton from "./Button";

interface Props {
    hangup: () => void;
    remoteStream?: MediaStream | null;
    localStream?: MediaStream | null;
}
function ButtonContainer(props: Props) {
    return (
        <View style={styles.bContainer}>
            <CustomButton iconName="phone"
                backgroundColor="red"
                onPress={props.hangup}
            />
        </View>
    )
}

export default function AudioCallScreen(props: Props) {
    const [callDuration, setCallDuration] = useState(0);

    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [IsMuted, setIsMuted] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (props.remoteStream) {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        inCallManager.start({ media: 'audio' });
        inCallManager.setSpeakerphoneOn(false);

        return () => {
            if (interval) clearInterval(interval);
            inCallManager.stop();
        }
    }, [props.remoteStream]);

    const toggleSpeaker = () => {
        const newSpeakerState = !isSpeakerOn;
        setIsSpeakerOn(newSpeakerState);
        inCallManager.setSpeakerphoneOn(newSpeakerState);
        console.log("Speakerphone:", newSpeakerState ? "ON" : "OFF");
    };

    //for set timer
    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    //for set a call mute
    const toggleMute = () => {
        if (!props.localStream) {
            console.log("No local stream available to mute");
            return;
        }
        const audioTracks = props.localStream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.log("No audio tracks found in local stream");
            return;
        }
        audioTracks.forEach(track => {
            console.log("Track enableddd!", track.enabled)
            track.enabled = !track.enabled;
        });
        setIsMuted(!IsMuted)

    }

    //on call we will just display the local stream
    return (
        <View style={styles.container}>
            <Text style={styles.timer}>{formatDuration(callDuration)}</Text>
            <View style={styles.buttonContainer}>
                <CustomButton iconName={isSpeakerOn ? 'volume-up' : 'volume-off'} backgroundColor='rgba(128, 128, 128, 0.7)' onPress={toggleSpeaker} />
                <CustomButton iconName={IsMuted ? 'microphone-slash' : 'microphone'} backgroundColor='rgba(128, 128, 128, 0.7)' onPress={toggleMute} style={{ marginStart: 10 }} />
            </View>
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
        backgroundColor: '#000'
    },
    callText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 10,
    },
    timer: {
        top: 20,
        bottom: 20,
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        fontWeight: 'bold',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: 5,
        borderRadius: 5,
    },
    speakerButton: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: 10,
        margin: 10,
        borderRadius: 50,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: 20,
        marginBottom: 24
    },
})