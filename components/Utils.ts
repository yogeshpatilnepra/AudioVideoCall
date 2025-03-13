import { mediaDevices, MediaStream } from "react-native-webrtc";

// type MediaDeviceInfoType = {
//     deviceId: string;
//     kind: string;
//     label: string;
//     groupId: string;
//     facing?: string;
// };

declare global {
    var existingAudioStream: MediaStream | null;
    var existingVideoStream: MediaStream | null;
}

export default class Utils {
    static async getStream() {

        if (global.existingVideoStream) {
            global.existingVideoStream.getVideoTracks().forEach(track => track.stop());
            global.existingVideoStream = null;
        }

        let isFront = true;
        const sourceInfos = await mediaDevices.enumerateDevices() as any[];
        console.log(sourceInfos);
        let videoSourceId;
        for (let i = 0; i < sourceInfos.length; i++) {
            const sourceInfo = sourceInfos[i];
            if (sourceInfo.kind == "videoinput" &&
                sourceInfo.facing == (isFront ? "front" : "environment")) {
                videoSourceId = sourceInfo.deviceId;
            }
        }
        try {
            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: {
                    width: 640,
                    height: 380,
                    frameRate: 30,
                    facingMode: (isFront ? "user" : "environment"),
                    deviceId: videoSourceId,
                }
            })
            if (stream) {
                global.existingVideoStream = stream;
                return stream;
            }

        } catch (error) {
            console.error("Error accessing video devices:", error);
        }

        // if (typeof stream != 'boolean') return stream;
        return null;
    }


    static async getAudioStream() {

        if (global.existingAudioStream) {
            global.existingAudioStream.getTracks().forEach(track => track.stop());
            global.existingAudioStream = null;
        }

        try {
            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            if (stream) {
                global.existingAudioStream = stream;
                return stream;
            }
        } catch (error) {
            console.error("Error accessing audio devices:", error);
        }
        return null;
    }

}