import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UploadSetupScreen from '../UploadSetupScreen';

jest.mock('../../../services/apiClient', () => ({
  apiClient: { post: jest.fn() },
  ApiError: class ApiError extends Error { status = 500; },
}));

describe('Resume setup UI', () => {
  it('offers both upload and build-from-scratch entry paths', () => {
    render(<UploadSetupScreen onComplete={jest.fn()} />);

    expect(screen.getByRole('button', { name: /upload existing resume/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /build from scratch/i })).toBeVisible();
  });

  it('rejects unsupported files before any API request', () => {
    render(<UploadSetupScreen onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /upload existing resume/i }));

    const input = document.querySelector('#file-input') as HTMLInputElement;
    const invalid = new File(['not a resume'], 'resume.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [invalid] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/please choose a pdf or docx file/i);
    expect(screen.getByRole('button', { name: /review my resume/i })).toBeDisabled();
  });

  it('accepts a bounded PDF and enables review', () => {
    render(<UploadSetupScreen onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /upload existing resume/i }));

    const input = document.querySelector('#file-input') as HTMLInputElement;
    const pdf = new File(['bounded pdf fixture'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });

    expect(screen.getByText('resume.pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: /review my resume/i })).toBeEnabled();
  });

  it('renders the guided scratch-builder sections', () => {
    render(<UploadSetupScreen onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /build from scratch/i }));

    expect(screen.getByRole('heading', { name: /build your resume/i })).toBeVisible();
    expect(screen.getByText('Contact Details')).toBeVisible();
    expect(screen.getByText('Professional Summary')).toBeVisible();
    expect(screen.getByText('Experience')).toBeVisible();
    expect(screen.getByText('Education')).toBeVisible();
  });
});
