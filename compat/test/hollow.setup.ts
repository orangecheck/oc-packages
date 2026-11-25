import { vi } from 'vitest';

// Loaded only with COMPAT_HOLLOW=1: every reader under test, automocked.
vi.mock('@orangecheck/auth-core');
vi.mock('auth-core-2.22.0');
vi.mock('@orangecheck/auth-client');
vi.mock('auth-client-2.51.0');
vi.mock('@orangecheck/chat-core');
