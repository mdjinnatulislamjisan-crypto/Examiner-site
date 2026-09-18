const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['examiner', 'candidate', 'admin'], default: 'candidate' },
  },
  { timestamps: true }
);

UserSchema.methods.setPassword = async function (password) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(password, salt);
};

UserSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

UserSchema.methods.toSafeJSON = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role };
};

module.exports = mongoose.model('User', UserSchema);
