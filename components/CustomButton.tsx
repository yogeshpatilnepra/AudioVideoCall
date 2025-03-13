import { Text, TouchableOpacity } from "react-native";
import { StyleSheet, View } from "react-native";
// import { Icon } from "react-native-vector-icons/";
import Icon from 'react-native-vector-icons/FontAwesome';
interface Props {
    onPress?: any;
    text?: string;
    backgroundColor?: string;
    style?: any;
}
export default function CustomButtonNew(props: Props) {
    return (
        <View>
            <TouchableOpacity onPress={props.onPress}
                style={[{ backgroundColor: props.backgroundColor }, props.style, styles.button]}>

                <Text style={{ color: 'white' }}>{props.text}</Text>
            </TouchableOpacity>
        </View>
    )
}
const styles = StyleSheet.create({
    button: {
        width: "auto",
        height: "auto",
        padding: 10,
        elevation: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 10,
    }
})