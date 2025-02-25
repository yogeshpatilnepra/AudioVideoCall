import { StyleSheet } from "react-native";
import { TouchableOpacity } from "react-native";
import { View } from "react-native";
import Button from "./Button";

interface Props {
    hangup: () => void;
    join: () => void;
}
export default function GettingCall(props: Props) {
    return (
        <View style={styles.container}>
            <View style={styles.bContainer}>
                <Button iconName='phone' backgroundColor='green' onPress={props.join}
                    style={{ marginRight: 30 }} />
                <Button iconName='phone' backgroundColor='red' onPress={props.hangup} style={{ marginLeft: 30 }} />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    image: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    bContainer: {
        flexDirection: 'row',
        bottom: 30
    },
    buttonStyle: {
        marginRight: 30
    }
})