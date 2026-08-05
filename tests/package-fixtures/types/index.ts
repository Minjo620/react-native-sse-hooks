import {
  useEventSource,
  type EventSourceMessage,
  type UseEventSourceOptions,
} from 'react-native-sse-hooks';

const options: UseEventSourceOptions<'token'> = {
  enabled: false,
  onMessage(message: EventSourceMessage<'token'>) {
    const event: 'token' | 'message' = message.event;
    void event;
  },
};

function useFixtureConnection() {
  const connection = useEventSource<'token'>('https://example.invalid/sse', options);
  connection.close();
}

void useFixtureConnection;
