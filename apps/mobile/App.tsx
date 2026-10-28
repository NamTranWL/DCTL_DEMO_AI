import { familyRoom } from '@dctl/shared';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { env } from './src/config/env';

/** Placeholder root screen until navigation is set up in B10. */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đi chợ Tiện lợi</Text>
      <Text style={styles.caption}>API: {env.apiUrl}</Text>
      <Text style={styles.caption}>Realtime: {env.wsUrl}</Text>
      <Text style={styles.caption}>Room mẫu: {familyRoom('demo')}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  caption: {
    fontSize: 14,
    color: '#555555',
  },
});
