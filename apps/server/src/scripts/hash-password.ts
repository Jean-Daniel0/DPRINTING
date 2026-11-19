import { hashPassword } from '../auth';

const password = process.argv[2];
if (!password) {
  console.error('Usage : npm run admin:hash -- "mot-de-passe"');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Le mot de passe administrateur doit contenir au moins 10 caractères.');
  process.exit(1);
}
console.log(hashPassword(password));
