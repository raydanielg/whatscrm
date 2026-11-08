/**
 * Root-level error boundary. Catches render errors so the app never
 * white-screens in production; ships a Retry action that resets state.
 */
import React, { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root} accessibilityLiveRegion="assertive">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            {this.state.error.message || 'Unexpected error. Please try again.'}
          </Text>
          <Pressable
            onPress={this.reset}
            style={styles.btn}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#111' },
  body: { fontSize: 14, color: '#555', marginBottom: 20 },
  btn: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#075E54',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnText: { color: '#fff', fontWeight: '600' },
});
