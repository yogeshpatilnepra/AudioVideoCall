import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import inCallManager from "react-native-incall-manager";
import { MediaStream, RTCView } from "react-native-webrtc";
import CustomButton from "./Button";
import { TouchableOpacity } from "react-native";
import { Image } from "react-native";

interface Props {
    hangup: () => void;
    localStream?: MediaStream | null;
    remoteStream?: MediaStream | null;
}
function ButtonContainer(props: Props) {
    return (
        <View style={styles.bContainer}>
            <CustomButton iconName="phone"
                backgroundColor="red"
                onPress={props.hangup}
                style={{ marginLeft: 30, transform: [{ rotate: '135deg' }] }} />
        </View>
    )
}
export default function Video(props: Props) {
    //on call we will just display the local stream

    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [IsMuted, setIsMuted] = useState(false);
    const [isFrontCamera, setIsFrontCamera] = useState(true);

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (props.remoteStream) {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }

        //code for start 
        inCallManager.start({ media: 'video' });
        inCallManager.setSpeakerphoneOn(false); // Default to earpiece

        return () => {
            inCallManager.stop(); // Cleanup when component unmounts
            if (interval) clearInterval(interval);
        };
    }, [props.remoteStream]);

    //speaker on
    const toggleSpeaker = () => {
        const newSpeakerState = !isSpeakerOn;
        setIsSpeakerOn(newSpeakerState);
        inCallManager.setSpeakerphoneOn(newSpeakerState);
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
        if (props.localStream) {
            props.localStream.getAudioTracks().forEach(track => {
                console.log("Track enableddd for videoscreen!", track.enabled)
                track.enabled = !track.enabled;
            });
            setIsMuted(!IsMuted)
        }
    }

    const switchCamera = () => {
        if (props.localStream) {
            props.localStream.getVideoTracks().forEach(track => {
                track._switchCamera();
            });
            setIsFrontCamera(!isFrontCamera);
        }
    }
    if (props.localStream && !props.remoteStream) {
        return <View style={styles.container}>
            <RTCView
                streamURL={props.localStream.toURL()}
                objectFit={'cover'}
                style={styles.remotevideo} />
            <ButtonContainer hangup={props.hangup} />

        </View>
    }
    //once the call is connected we will display
    //local stream on top of remote stream
    if (props.localStream && props.remoteStream) {
        return <View style={styles.container}>
            <RTCView
                streamURL={props.remoteStream ? props.remoteStream!!.toURL() : ''}
                objectFit={'cover'}
                style={styles.remotevideo} />

            <RTCView
                streamURL={props.localStream!!.toURL()}
                objectFit={'cover'}
                style={props.remoteStream ? styles.videoLocal : styles.remotevideo} />

            {/* <TouchableOpacity onPress={toggleSpeaker} style={styles.speakerButton}>
                <Icon
                    name={isSpeakerOn ? 'volume-up' : 'volume-off'}
                    size={26}
                    color="#fff"
                />
            </TouchableOpacity> */}

            {/* showing timer */}
            <Text style={styles.timer}>{formatDuration(callDuration)}</Text>

            {/* //Control button */}

            <View style={styles.buttonContainer}>
                <CustomButton iconName={isSpeakerOn ? 'volume-up' : 'volume-off'} backgroundColor='rgba(128, 128, 128, 0.7)' onPress={toggleSpeaker} />
                <TouchableOpacity onPress={switchCamera} style={[styles.deleteIconWrapper]}>
                    <Image
                        height={0}
                        width={0}
                        source={require('../assets/camera-reverse.png')}
                        style={styles.deleteIcon}
                    />
                </TouchableOpacity>

                <CustomButton iconName={IsMuted ? 'microphone-slash' : 'microphone'} backgroundColor='rgba(128, 128, 128, 0.7)' onPress={toggleMute} style={{ marginStart: 10 }} />
            </View>
            <ButtonContainer hangup={props.hangup} />
        </View>
    }
    return <ButtonContainer hangup={props.hangup} />
}
const styles = StyleSheet.create({
    bContainer: {
        flexDirection: 'row',
        bottom: 30
    },
    container: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    remotevideo: {
        position: 'absolute',
        width: '100%',
        height: '100%'
    },
    videoLocal: {
        position: 'absolute',
        width: 100,
        height: 150,
        top: 20,
        left: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#000"
    },
    speakerButton: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: 15,
        margin: 10,
        borderRadius: 50,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: 20,
        marginBottom: 24
    },
    timer: {
        position: 'absolute',
        top: 20,
        left: 25,
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        fontWeight: 'bold',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: 5,
        borderRadius: 5,
    },
    button: {
        backgroundColor: 'rgba(128, 128, 128, 0.7)',
        padding: 15,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hangupButton: {
        backgroundColor: '#ff0000',
        padding: 15,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteIconWrapper: {
        alignItems: 'center',
        width: 60,
        height: 60,
        backgroundColor: 'rgba(128, 128, 128, 0.7)',
        borderRadius: 100,
        justifyContent: 'center',
        marginStart: 10,
    },
    deleteIcon: {
        width: 30,
        height: 30,
        padding: 10,
        elevation: 10,
        tintColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
})