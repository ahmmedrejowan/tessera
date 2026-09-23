import { describe, expect, it } from 'vitest';
import { ALL_QUESTIONS, HELP, searchHelp, topicById } from '../src/shared/help';

describe('the help centre', () => {
  it('has topics whose questions are all reachable and unique', () => {
    expect(HELP.length).toBeGreaterThan(5);
    const ids = ALL_QUESTIONS.map(({ topic, question }) => `${topic.id}/${question.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of HELP) {
      expect(topicById(topic.id)).toBe(topic);
      expect(topic.questions.length).toBeGreaterThan(0);
      for (const q of topic.questions) expect(q.a.join('').length).toBeGreaterThan(40);
    }
  });

  it('finds an answer by the words someone would type', () => {
    expect(searchHelp('backup password').map((f) => f.question.id)).toContain('backups');
    expect(searchHelp('kenney').map((f) => f.topic.id)).toContain('download');
    expect(searchHelp('credit line')[0]?.question.id).toBe('credit-line');
    // Every word has to be there, so a nonsense pair finds nothing.
    expect(searchHelp('backup unicorn')).toEqual([]);
    expect(searchHelp(' ')).toEqual([]);
  });
});
