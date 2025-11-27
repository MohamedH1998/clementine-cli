import kleur from 'kleur';

export const logger = {
  intro(message: string) {
    console.log(kleur.bold().cyan(`\n✨ ${message}\n`));
  },

  success(message: string) {
    console.log(kleur.green(`✓ ${message}`));
  },

  error(message: string) {
    console.log(kleur.red(`✗ ${message}`));
  },

  info(message: string) {
    console.log(kleur.blue(`ℹ ${message}`));
  },

  warn(message: string) {
    console.log(kleur.yellow(`⚠ ${message}`));
  },

  step(message: string) {
    console.log(kleur.dim(`→ ${message}`));
  },
};
