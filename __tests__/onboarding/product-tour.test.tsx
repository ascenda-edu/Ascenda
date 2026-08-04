/**
 * The spotlight's behavioural contract.
 *
 * Three things here are worth a test rather than a code read, because all three are
 * silent when they break:
 *
 * 1. THE HOLE STAYS LIVE. The dismiss layer is four rects tiled AROUND the
 *    highlight, not one over the whole viewport. Regress that and clicking the thing
 *    the tour is pointing at closes the tour instead of using it — which was the
 *    single most trapping thing about the flow this replaced. It looks identical on
 *    screen either way, so only a structural assertion catches it.
 *
 * 2. NO ANCHORS MEANS DISMISSED, NOT AN EMPTY OVERLAY. A tour whose anchors have all
 *    been renamed away must report itself dismissed rather than flashing a scrim over
 *    nothing.
 *
 * 3. ARROW KEYS BELONG TO THE USER WHEN THEY ARE TYPING. A consequence of (1): the
 *    spotlit element can be a search box, and moving the caret must not skip steps.
 *    Escape is exempt, because an unconditional exit is what keeps this from being a
 *    trap.
 *
 * jsdom returns an all-zero `getBoundingClientRect` for every element, and the tour
 * reads a zero box as "anchor absent" — so without the override below every test here
 * would pass for the wrong reason, by rendering nothing at all.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProductTour } from '@/components/onboarding/product-tour';
import type { TourStep } from '@/lib/onboarding/tours';

const STEPS: TourStep[] = [
  { anchor: 'alpha', title: 'The first thing', body: 'What alpha is for.' },
  { anchor: 'beta', title: 'The second thing', body: 'What beta is for.' }
];

const RECT = { top: 100, left: 100, width: 200, height: 50, bottom: 150, right: 300, x: 100, y: 100 };

let originalRect: typeof Element.prototype.getBoundingClientRect;

beforeAll(() => {
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return { ...RECT, toJSON: () => RECT } as DOMRect;
  };
  // `scrollIntoView` is not implemented in jsdom at all, and the tour calls it.
  Element.prototype.scrollIntoView = jest.fn();
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

/** Put the anchors the tour expects into the document. */
const mountAnchors = (anchors: string[]) => {
  for (const anchor of anchors) {
    const node = document.createElement('div');
    node.setAttribute('data-tour', anchor);
    document.body.appendChild(node);
  }
};

const renderTour = (props: Partial<React.ComponentProps<typeof ProductTour>> = {}) => {
  const onDismiss = jest.fn();
  const onComplete = jest.fn();
  const view = render(
    <ProductTour steps={STEPS} onDismiss={onDismiss} onComplete={onComplete} signOff={null} {...props} />
  );
  return { onDismiss, onComplete, ...view };
};

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('walking through the steps', () => {
  beforeEach(() => mountAnchors(['alpha', 'beta']));

  it('opens on the first step', () => {
    renderTour();

    expect(screen.getByText('The first thing')).toBeInTheDocument();
    expect(screen.getByText('1 of 2', { exact: false })).toBeInTheDocument();
  });

  it('advances on Next and goes back on Back', () => {
    renderTour();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('The second thing')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('The first thing')).toBeInTheDocument();
  });

  it('has no Back button on the first step', () => {
    renderTour();

    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();
  });

  it('completes with the avatar rect so the caller can fly it home', () => {
    const { onComplete } = renderTour();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    // A rect, not null. `null` is the caller's "do not fly" signal, so handing it one
    // here would silently disable the finale.
    expect(onComplete.mock.calls[0][0]).not.toBeNull();
  });
});

describe('the sign-off', () => {
  beforeEach(() => mountAnchors(['alpha', 'beta']));

  it('holds the farewell on screen before handing off', () => {
    jest.useFakeTimers();
    const { onComplete } = renderTour({ signOff: 'Ask me anything.' });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    // The farewell is up and the hand-off has NOT happened yet — that dwell is what
    // makes the line readable rather than a flicker on the way out.
    expect(screen.getByText('Ask me anything.')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('hands off immediately when there is no farewell to show', () => {
    // Every tour after the user's first passes `signOff: null`, so this is the common
    // path and it must not sit on a timer.
    const { onComplete } = renderTour({ signOff: null });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('hides the step controls while signing off', () => {
    jest.useFakeTimers();
    renderTour({ signOff: 'Ask me anything.' });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    // Nothing to press during the farewell: a "Skip" on a screen that is already
    // leaving invites a click that races the hand-off.
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe('the spotlight hole stays usable', () => {
  beforeEach(() => mountAnchors(['alpha', 'beta']));

  // NOTE: these query `document.body`, not the render `container`. The overlay is a
  // `createPortal` into `document.body`, so it is not inside the container at all and
  // a container query here would find zero of everything and pass vacuously.
  it('tiles FOUR dismiss rects around the highlight rather than one over it', () => {
    renderTour();

    // The structural assertion. One rect here means someone has covered the hole
    // again, and the spotlit control is no longer clickable.
    const dismissRects = document.body.querySelectorAll('button[aria-hidden="true"]');
    expect(dismissRects).toHaveLength(4);
  });

  it('leaves the scrim itself unable to intercept anything', () => {
    renderTour();

    // The painted scrim must stay `pointer-events-none` — it covers the hole by
    // construction (one huge box-shadow spread), so if it caught clicks the four
    // rects beneath it would be pointless.
    const scrim = document.body.querySelector('.pointer-events-none.absolute.rounded-2xl');
    expect(scrim).not.toBeNull();
  });
});

describe('when no anchor is present', () => {
  it('reports itself dismissed instead of showing an empty overlay', () => {
    // Nothing mounted: every anchor is missing, as it would be after a rename.
    const { onDismiss } = renderTour();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('The first thing')).not.toBeInTheDocument();
  });

  it('skips a step whose own anchor is missing but keeps the rest', () => {
    mountAnchors(['beta']);
    renderTour();

    // The tour shortens rather than pointing at nothing, and renumbers to match —
    // "1 of 2" above a single step would be a lie.
    expect(screen.getByText('The second thing')).toBeInTheDocument();
    expect(screen.queryByText('1 of 2', { exact: false })).not.toBeInTheDocument();
  });
});

describe('leaving', () => {
  beforeEach(() => mountAnchors(['alpha', 'beta']));

  it.each([
    ['Skip', 'Skip'],
    ['the close button', 'Close the tour']
  ])('dismisses from %s', (_label, accessibleName) => {
    const { onDismiss } = renderTour();

    fireEvent.click(screen.getByRole('button', { name: accessibleName }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape', () => {
    const { onDismiss } = renderTour();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape even from inside a text field', () => {
    // The one key that is deliberately NOT filtered by `isTypingTarget`. An overlay
    // covering the whole app with no unconditional exit is a trap.
    const { onDismiss } = renderTour();
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('arrow keys', () => {
  beforeEach(() => mountAnchors(['alpha', 'beta']));

  it('advance and retreat through the steps', () => {
    renderTour();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('The second thing')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('The first thing')).toBeInTheDocument();
  });

  it.each(['input', 'textarea', 'select'])('are left alone while typing in a <%s>', (tag) => {
    // Only reachable because the hole is live: a student can focus the search box the
    // tour is pointing at, and every caret move would otherwise skip a step.
    renderTour();
    const field = document.createElement(tag);
    document.body.appendChild(field);

    fireEvent.keyDown(field, { key: 'ArrowRight' });

    expect(screen.getByText('The first thing')).toBeInTheDocument();
  });

  it('are left alone inside a contenteditable', () => {
    renderTour();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    // jsdom does not derive `isContentEditable` from the attribute, so it is defined
    // directly — the component reads the property, which is the correct thing to read.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);

    fireEvent.keyDown(editable, { key: 'ArrowRight' });

    expect(screen.getByText('The first thing')).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  beforeEach(() => mountAnchors(['alpha', 'beta']));

  it('is a dialog that does NOT claim modality', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');

    // `aria-modal` would tell a screen reader the page behind is unavailable — the
    // opposite of this design, and it would hide the very element being described
    // from the virtual cursor.
    expect(dialog).not.toHaveAttribute('aria-modal');
  });

  it('labels and describes itself from the current step', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAccessibleName('The first thing');
    expect(dialog).toHaveAccessibleDescription('What alpha is for.');
  });
});
