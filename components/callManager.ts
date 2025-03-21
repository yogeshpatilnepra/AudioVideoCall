import { useEffect, useState } from "react";
import firestore from '@react-native-firebase/firestore';

export const useCallListener = (myId: string | null, onCallReceived: (callerId: string) => void) => {
    const [isGettingCall, setIsGettingCall] = useState(false);
    const [callerId, setCallerId] = useState<string | null>(null);

    useEffect(() => {
        if (!myId) return; // Only listen if ID exists

        const subscriber = firestore()
            .collection('meet')
            .where('targetId', '==', myId)
            .where('hangup', '==', false)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        setCallerId(data.callerId);
                        setIsGettingCall(true);
                        onCallReceived(data.callerId);
                    } else if (change.type === 'modified' && change.doc.data().hangup) {
                        setIsGettingCall(false);
                        setCallerId(null);
                    }
                });
            });

        return () => subscriber();
    }, [myId, onCallReceived]);

    return { isGettingCall, callerId };
};

export const hangupCall = async (myId: string, targetId: string) => {
    const callId = `${targetId}_${myId}`;
    await firestore().collection('meet').doc(callId).update({ hangup: true });
};