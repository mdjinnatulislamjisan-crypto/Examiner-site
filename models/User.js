const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['examiner', 'candidate', 'admin'], default: 'candidate' },

    emailVerified: { type: Boolean, default: false },
    verifyToken: { type: String, default: null },
    verifyTokenExpires: { type: Date, default: null },

    resetToken: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
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

// Verification link is valid for 24 hours.
UserSchema.methods.generateVerifyToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.verifyToken = token;
  this.verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return token;
};

// Password reset link is valid for 1 hour.
UserSchema.methods.generateResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetToken = token;
  this.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
  return token;
};

UserSchema.methods.toSafeJSON = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role, emailVerified: this.emailVerified };
};

module.exports = mongoose.model('User', UserSchema);
