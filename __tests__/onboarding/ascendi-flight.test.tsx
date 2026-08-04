/**
 * The finale's failure paths.
 *
 * `AscendiFlight` animates the assistant's avatar from the coach card to the chat
 * launcher. The launcher is frequently NOT there — the widget removes itself on
 * `/assistant` routes, it is a `next/dynamic` chunk that may still be loading, and it
 * unmounts entirely while the chat panel is open. The caller signals that with a
 * `null` destination.
 *
 * The thing that must hold in every one of those cases is that `onArrive` still
 * fires. It is what writes the breadcrumb, fires the launcher's pulse and returns the
 * coach to idle — so a path that never calls it leaves the avatar frozen on screen
 * over a page the user can no longer interact with, and the tour recorded as
 * unfinished. That is the worst outcome this component can produce, and it is exactly
 * the one a "cool animation" gets wrong.
 */

import { render, act } from '@testing-library/react';
import { AscendiFlight } from '@/components/onboarding/ascendi-flight';

const rect = (top: number, left: number): DOMRect =>
  ({ top, left, width: 36, height: 36, bottom: top + 36, right: left + 36, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const FROM = rect(120, 400);
const LAUNCHER = rect(700, 1200);

describe('when there is no launcher to fly to', () => {
  it('still calls onArrive, so the tour can never hang', () => {
    jest.useFakeTimers();
    const onArrive = jest.fn();

    render(<AscendiFlight from={FROM} to={null} onArrive={onArrive} />);

    // Not synchronous — the avatar fades out where it stands first, so the finale
    // still reads as deliberate rather than as the element blinking out.
    expect(onArrive).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onArrive).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('resolves on a timer rather than an animation callback', () => {
    /**
     * Why this is asserted separately: `onAnimationComplete` is the natural hook and
     * it cannot be trusted on this path. A zero-duration or reduced-motion transition
     * can settle before React has attached the callback, which strands the flow with
     * no breadcrumb written. Advancing timers alone must be sufficient to finish.
     */
    jest.useFakeTimers();
    const onArrive = jest.fn();

    render(<AscendiFlight from={FROM} to={null} onArrive={onArrive} />);
    act(() => {
      jest.runAllTimers();
    });

    expect(onArrive).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('renders the avatar at its origin, not at 0,0', () => {
    // The bug this guards: treating a missing destination as a zeroed rect and
    // animating there flings the avatar into the top-left corner of the screen.
    render(<AscendiFlight from={FROM} to={null} onArrive={jest.fn()} />);

    const avatar = document.body.querySelector('.fixed.z-modal') as HTMLElement | null;
    expect(avatar).not.toBeNull();
    expect(avatar!.style.top).toBe('120px');
    expect(avatar!.style.left).toBe('400px');
  });
});

describe('when the launcher is present', () => {
  it('mounts the avatar into a portal on the body', () => {
    // Portalled so it is never clipped by an ancestor's `overflow` on the way across
    // the screen — the flight crosses the entire viewport.
    const { container } = render(<AscendiFlight from={FROM} to={LAUNCHER} onArrive={jest.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('.fixed.z-modal')).not.toBeNull();
  });

  it('never intercepts pointer events on the way', () => {
    // It flies over real controls. A 44px circle that eats clicks mid-flight is a
    // mis-click waiting to happen.
    render(<AscendiFlight from={FROM} to={LAUNCHER} onArrive={jest.fn()} />);

    const avatar = document.body.querySelector('.fixed.z-modal');
    expect(avatar).toHaveClass('pointer-events-none');
  });
});
