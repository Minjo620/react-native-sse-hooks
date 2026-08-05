import { StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventSource } from '../src/useEventSource';
import type { EventSourceMessage, UseEventSourceResult } from '../src/types';

const appState = vi.hoisted(
  (): {
    listeners: Set<(state: string) => void>;
    currentState: string | null;
    legacy: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  } => {
    const listeners = new Set<(state: string) => void>();
    const state = {
      listeners,
      currentState: 'active',
      legacy: false,
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        listeners.add(listener);
        return state.legacy ? undefined : { remove: () => listeners.delete(listener) };
      }),
      removeEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        listeners.delete(listener);
      }),
    };
    return state;
  },
);

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState.currentState;
    },
    addEventListener: appState.addEventListener,
    removeEventListener: appState.removeEventListener,
  },
}));

class HookXHR {
  static instances: HookXHR[] = [];
  static LOADING = 3;
  static DONE = 4;

  readyState = 0;
  status = 0;
  responseText = '';
  timeout = 0;
  withCredentials = false;
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  aborted = false;
  headers: Record<string, string> = {};

  constructor() {
    HookXHR.instances.push(this);
  }

  open() {
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  getResponseHeader() {
    return 'text/event-stream';
  }

  send() {}

  abort() {
    this.aborted = true;
  }

  emit(text: string) {
    this.responseText = text;
    this.readyState = HookXHR.LOADING;
    this.status = 200;
    this.onreadystatechange?.();
  }
}

interface ProbeProps {
  enabled?: boolean | undefined;
  headers?: Record<string, string> | undefined;
  openWhenBackground?: boolean | undefined;
  onMessage?: ((message: EventSourceMessage) => void) | undefined;
  onResult: (result: UseEventSourceResult) => void;
}

function Probe({ enabled, headers, openWhenBackground, onMessage, onResult }: ProbeProps) {
  const result = useEventSource('https://example.com/events', {
    enabled,
    headers,
    openWhenBackground,
    onMessage,
  });
  onResult(result);
  return null;
}

describe('useEventSource contract', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    HookXHR.instances = [];
    appState.listeners.clear();
    appState.currentState = 'active';
    appState.legacy = false;
    vi.stubGlobal('XMLHttpRequest', HookXHR);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  it('uses the latest committed callback without reconnecting', () => {
    const first = vi.fn();
    const second = vi.fn();
    act(() => {
      renderer = create(<Probe onMessage={first} onResult={() => {}} />);
    });

    act(() => {
      renderer!.update(<Probe onMessage={second} onResult={() => {}} />);
    });
    act(() => HookXHR.instances[0]!.emit('data: latest\n\n'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(HookXHR.instances).toHaveLength(1);
  });

  it('pauses in background and resumes from the committed event ID', () => {
    act(() => {
      renderer = create(<Probe onResult={() => {}} />);
    });
    const first = HookXHR.instances[0]!;
    act(() => first.emit('id: 7\ndata: before background\n\n'));
    act(() => appState.listeners.forEach(listener => listener('background')));
    act(() => appState.listeners.forEach(listener => listener('active')));

    expect(first.aborted).toBe(true);
    expect(HookXHR.instances[1]!.headers['Last-Event-ID']).toBe('7');
  });

  it('starts paused in background unless the caller opts out of that policy', () => {
    appState.currentState = 'background';
    act(() => {
      renderer = create(<Probe onResult={() => {}} />);
    });
    expect(HookXHR.instances).toHaveLength(0);
    act(() => appState.listeners.forEach(listener => listener('active')));
    expect(HookXHR.instances).toHaveLength(1);

    act(() => renderer!.unmount());
    renderer = undefined;
    HookXHR.instances = [];
    appState.listeners.clear();
    act(() => {
      renderer = create(<Probe openWhenBackground onResult={() => {}} />);
    });
    expect(HookXHR.instances).toHaveLength(1);
    expect(appState.listeners.size).toBe(0);
  });

  it('supports manual ownership and retires the request on unmount', () => {
    let result: UseEventSourceResult | undefined;
    act(() => {
      renderer = create(<Probe enabled={false} onResult={value => void (result = value)} />);
    });
    expect(result?.status).toBe('idle');
    expect(HookXHR.instances).toHaveLength(0);

    act(() => result!.open());
    const first = HookXHR.instances[0]!;
    expect(result?.status).toBe('connecting');
    act(() => result!.close());
    expect(first.aborted).toBe(true);
    expect(result?.status).toBe('closed');

    act(() => result!.open());
    const second = HookXHR.instances[1]!;
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(second.aborted).toBe(true);
  });

  it('compares headers by value and preserves the resume point when they change', () => {
    act(() => {
      renderer = create(
        <Probe headers={{ Authorization: 'old', 'X-Trace': 'one' }} onResult={() => {}} />,
      );
    });
    act(() => HookXHR.instances[0]!.emit('id: 7\ndata: first\n\n'));

    act(() => {
      renderer!.update(
        <Probe headers={{ 'x-trace': 'one', authorization: 'old' }} onResult={() => {}} />,
      );
    });
    expect(HookXHR.instances).toHaveLength(1);

    act(() => {
      renderer!.update(
        <Probe headers={{ Authorization: 'new', 'X-Trace': 'one' }} onResult={() => {}} />,
      );
    });
    expect(HookXHR.instances).toHaveLength(2);
    expect(HookXHR.instances[1]!.headers['Last-Event-ID']).toBe('7');
  });

  it('preserves resources under StrictMode and supports legacy AppState cleanup', () => {
    appState.legacy = true;
    act(() => {
      renderer = create(
        <StrictMode>
          <Probe onResult={() => {}} />
        </StrictMode>,
      );
    });

    expect(HookXHR.instances.length).toBeGreaterThanOrEqual(2);
    expect(HookXHR.instances.slice(0, -1).every(instance => instance.aborted)).toBe(true);
    expect(appState.listeners.size).toBe(1);

    act(() => renderer!.unmount());
    renderer = undefined;
    expect(appState.removeEventListener).toHaveBeenCalled();
    expect(appState.listeners.size).toBe(0);
  });
});
