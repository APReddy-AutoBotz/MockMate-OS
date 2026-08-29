import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from '../Login';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithGoogle,
} from '../../services/supabaseClient';

jest.mock('../../services/supabaseClient', () => ({
  auth: {},
  isUsingMockAuth: false,
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithGoogle: jest.fn(),
}));

jest.mock('../../services/audioService', () => ({
  audioService: {
    playConfirm: jest.fn(),
    playStart: jest.fn(),
  },
}));

const createUser = createUserWithEmailAndPassword as jest.MockedFunction<typeof createUserWithEmailAndPassword>;
const signIn = signInWithEmailAndPassword as jest.MockedFunction<typeof signInWithEmailAndPassword>;
const google = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;

const renderLogin = () => {
  const onLoginSuccess = jest.fn();
  const onBack = jest.fn();
  render(<Login onLoginSuccess={onLoginSuccess} onBack={onBack} />);
  return { onLoginSuccess, onBack };
};

const switchToSignup = () => {
  fireEvent.click(screen.getByRole('button', { name: /need an account\? sign up/i }));
};

const fillCredentials = () => {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'qa-user@example.invalid' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'not-a-real-secret' } });
};

describe('hosted authentication UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a confirmation-required signup on the auth screen', async () => {
    createUser.mockResolvedValue({
      user: { id: 'qa-user' } as any,
      session: null,
      confirmationRequired: true,
    });
    const { onLoginSuccess } = renderLogin();
    switchToSignup();
    fillCredentials();

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/check your email to confirm your account/i);
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('enters the app when signup returns an authenticated session', async () => {
    createUser.mockResolvedValue({
      user: { id: 'qa-user' } as any,
      session: {} as any,
      confirmationRequired: false,
    });
    const { onLoginSuccess } = renderLogin();
    switchToSignup();
    fillCredentials();

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
  });

  it('signs in with email/password using the current form controls', async () => {
    signIn.mockResolvedValue({ user: { id: 'qa-user' } as any });
    const { onLoginSuccess } = renderLogin();
    fillCredentials();

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
  });

  it('explains when Google OAuth is disabled instead of reporting an opaque failure', async () => {
    google.mockRejectedValue(Object.assign(new Error('Provider is not enabled'), {
      code: 'auth/google-failed',
    }));
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /google/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/google sign-in is not enabled yet/i);
  });
});
