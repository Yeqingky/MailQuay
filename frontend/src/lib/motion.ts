import type { Transition } from 'motion/react';

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 42,
  mass: 0.7,
};

export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};

export const FADE_TRANSITION: Transition = {
  duration: 0.16,
  ease: EASE_OUT,
};
