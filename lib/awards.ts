import type { Award, UserAward } from './types';

export const AWARD_TYPES: Award[] = [
  {
    id: 'gold',
    name: 'Gold Award',
    emoji: '🥇',
    cost: 100,
    description: 'Outstanding contribution',
    color: 'text-yellow-500',
  },
  {
    id: 'silver',
    name: 'Silver Award',
    emoji: '🥈',
    cost: 50,
    description: 'Great insight',
    color: 'text-gray-400',
  },
  {
    id: 'bronze',
    name: 'Bronze Award',
    emoji: '🥉',
    cost: 25,
    description: 'Helpful comment',
    color: 'text-amber-600',
  },
  {
    id: 'fire',
    name: 'Fire Award',
    emoji: '🔥',
    cost: 75,
    description: 'Hot take',
    color: 'text-red-500',
  },
  {
    id: 'diamond',
    name: 'Diamond Award',
    emoji: '💎',
    cost: 200,
    description: 'Exceptional quality',
    color: 'text-blue-500',
  },
  {
    id: 'heart',
    name: 'Heart Award',
    emoji: '❤️',
    cost: 30,
    description: 'Loved this',
    color: 'text-pink-500',
  },
  {
    id: 'star',
    name: 'Star Award',
    emoji: '⭐',
    cost: 40,
    description: 'Shining bright',
    color: 'text-yellow-400',
  },
  {
    id: 'rocket',
    name: 'Rocket Award',
    emoji: '🚀',
    cost: 60,
    description: 'To the moon!',
    color: 'text-purple-500',
  },
];

// UserAward interface is now imported from types

export const getAwardById = (id: string): Award | undefined => {
  return AWARD_TYPES.find(award => award.id === id);
};

export const canAffordAward = (userPoints: number, awardCost: number): boolean => {
  return userPoints >= awardCost;
};
