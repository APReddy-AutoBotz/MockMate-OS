import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Hub from '../Hub';

describe('practice home availability', () => {
  it('shows ClearSpeak to every signed-in user and opens it directly', () => {
    const onNavigate = jest.fn();

    render(
      <Hub
        userProfile={null}
        onNavigate={onNavigate}
        onViewHistory={jest.fn()}
        onOpenCareerContext={jest.fn()}
        onDeleteData={jest.fn().mockResolvedValue({})}
      />,
    );

    expect(screen.getByRole('heading', { name: 'ClearSpeak' })).toBeInTheDocument();
    expect(screen.getByText(/record and listen back in private/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clearspeak/i }));
    expect(onNavigate).toHaveBeenCalledWith('SPEAK');
  });
});
