import prompts from 'prompts';
import kleur from 'kleur';

// Configure kleur to ensure colors work on both dark and light terminals
kleur.enabled = true;

/**
 * Wrapper around prompts that ensures messages have proper color for visibility
 * on both dark and light terminals. Applies white color to all question messages.
 */
export async function coloredPrompts(
  questions: prompts.PromptObject | prompts.PromptObject[],
  options?: prompts.Options
): Promise<prompts.Answers<string>> {
  const questionArray = Array.isArray(questions) ? questions : [questions];

  const coloredQuestions = questionArray.map(q => ({
    ...q,
    message: typeof q.message === 'string' ? kleur.white(q.message) : q.message,
  }));

  return prompts(Array.isArray(questions) ? coloredQuestions : coloredQuestions[0], options);
}
