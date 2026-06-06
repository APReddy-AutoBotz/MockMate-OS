import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ErrorBoundary from '../ErrorBoundary';

// Mock console.error to avoid noise in tests
const originalError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterEach(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  it('should render children when there is no error', () => {
    const Child = () => <div>Test Child</div>;
    
    render(
      <ErrorBoundary>
        <Child />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('should render error UI when child throws an error', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Refresh page')).toBeInTheDocument();
  });

  it('should call console.error when error occurs', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
  });

  it('should reset error when try again is clicked', () => {
    let shouldThrow = true;
    const BuggyChild = () => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div>Fixed Child</div>;
    };

    render(
      <ErrorBoundary>
        <BuggyChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    shouldThrow = false;
    const tryAgainButton = screen.getByText('Try again');
    fireEvent.click(tryAgainButton);

    expect(screen.getByText('Fixed Child')).toBeInTheDocument();
  });
});
