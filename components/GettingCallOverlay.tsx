import { NavigationContainerRef, NavigationProp } from "@react-navigation/native";
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RootStackParamList } from "../App";
const { width } = Dimensions.get('window');
import Icon from "react-native-vector-icons/FontAwesome";

interface GettingCallOverlayProps {
    callerId: string;
    onAccept: (callType?: string) => void;
    onHangup: () => void;
    navigation: NavigationContainerRef<RootStackParamList>;
}

export const GettingCallOverlay: React.FC<GettingCallOverlayProps> = ({ callerId,
    onAccept,
    onHangup,
    navigation, }) => {

    return (
        <View style={styles.overlay}>
            <View style={styles.notification}>
                <Text style={styles.callerText}>Call from {callerId}</Text>
                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.acceptButton} onPress={() =>onAccept()}>
                        <Icon name="phone" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Join</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectButton} onPress={onHangup}>
                        <Icon name="phone-slash" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Hangup</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 50, // Near top but below status bar
        left: 0,
        right: 0,
        zIndex: 1000,
        alignItems: 'center',
    },
    notification: {
        width: width * 0.9,
        backgroundColor: '#333',
        borderRadius: 10,
        padding: 15,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.8,
        shadowRadius: 2,
        elevation: 5,
    },
    callerText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    acceptButton: {
        flexDirection: 'row',
        backgroundColor: '#28a745',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
        flex: 1,
        marginRight: 5,
    },
    rejectButton: {
        flexDirection: 'row',
        backgroundColor: '#dc3545',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
        flex: 1,
        marginLeft: 5,
    },
    buttonText: {
        color: '#fff',
        marginLeft: 5,
        fontSize: 14,
    },
})