import { mediaDevices } from "react-native-webrtc";
import { View, TouchableOpacity, StyleSheet } from 'react-native';

// type MediaDeviceInfoType = {
//     deviceId: string;
//     kind: string;
//     label: string;
//     groupId: string;
//     facing?: string;
// };

export default class Utils {
    static async getStream(audioOnly = false) {
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
        const stream = await mediaDevices.getUserMedia({
            audio: true,
            video:
                audioOnly ? false :
                    {
                        width: 640,
                        height: 380,
                        frameRate: 30,
                        facingMode: (isFront ? "user" : "environment"),
                        deviceId: videoSourceId
                    }
        })
        if (typeof stream != 'boolean') return stream;
        return null;
    }
}