import bcrypt from 'bcryptjs';
console.log(bcrypt.hashSync('password', 12));
