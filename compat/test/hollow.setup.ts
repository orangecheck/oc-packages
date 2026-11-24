import { vi } from 'vitest';

// Loaded only with COMPAT_HOLLOW=1: every reader under test, automocked.
vi.mock('@orangecheck/auth-core');
vi.mock('auth-core-2.22.0');
