import { StyleSheet, View } from "react-native";
import { MediaStream, RTCView } from "react-native-webrtc";
import Button from "./Button";
import { Text } from "react-native";

interface Props {
    hangup: () => void;
    localStream?: MediaStream | null;
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
const changeCameraPosition = () => {
    console.log("Call")
}
export default function Video(props: Props) {
    //on call we will just display the local stream
    if (props.localStream && !props.remoteStream) {
        return <View style={styles.container}>
            <RTCView
                streamURL={props.localStream.toURL()}
                objectFit={'cover'}
                style={styles.video} />
            <ButtonContainer hangup={props.hangup} />

        </View>
    }
    //once the call is connected we will display
    //local stream on top of remote stream
    if (props.localStream && props.remoteStream) {
        return <View style={styles.container}>
            <RTCView
                streamURL={props.remoteStream.toURL()}
                objectFit={'cover'}
                mirror={true}
                style={styles.video} />
            <RTCView
                streamURL={props.localStream.toURL()}
                objectFit={'cover'}
                style={styles.videoLocal} />
            <Text style={styles.callText}>Video Call Screen</Text>
            <ButtonContainer hangup={props.hangup} />
            {/* <Button iconName='cameraswitch' onPress={changeCameraPosition} backgroundColor='grey' style={{ marginTop: 10 }} /> */}
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
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    video: {
        position: 'absolute',
        width: '100%',
        height: '100%'
    },
    callText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'red',
        marginBottom: 30,
    },
    videoLocal: {
        position: 'absolute',
        width: 100,
        height: 150,
        top: 0,
        left: 20,
        elevation: 10
    },
})