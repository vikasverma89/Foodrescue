
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function Auth() {
  const [mode, setMode] = useState("signup");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("donor");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("resetPassword");
        setMessage("Enter your new password.");
        setIsError(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function showMessage(text, error = false) {
    setMessage(text);
    setIsError(error);
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setMessage("");
    setIsError(false);
    setOtp("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    showMessage("");

    try {
      let result;

      if (mode === "signup") {
        if (!fullName.trim()) {
          throw new Error("Please enter your full name.");
        }

        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        if (role === "ngo" && !organizationName.trim()) {
          throw new Error("Please enter your NGO name.");
        }

        result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role,
              organization_name:
                role === "ngo" ? organizationName.trim() : "",
            },
          },
        });

        if (result.error) throw result.error;

        showMessage(
          result.data.session
            ? "Account created successfully! Welcome to FoodRescue."
            : "Account created! Check your email to verify your account, then log in."
        );
      } else if (mode === "login") {
        result = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (result.error) throw result.error;

        showMessage("Login successful!");
      } else if (mode === "phone") {
        if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
          throw new Error(
            "Enter your phone with country code, e.g. +919876543210."
          );
        }

        result = await supabase.auth.signInWithOtp({
          phone: phone.trim(),
          options: {
            shouldCreateUser: true,
            data: {
              full_name: fullName.trim(),
              role,
              organization_name:
                role === "ngo" ? organizationName.trim() : "",
            },
          },
        });

        if (result.error) throw result.error;

        showMessage("OTP sent! Enter the code received on your phone.");
        setMode("verifyOtp");
      } else if (mode === "verifyOtp") {
        if (!/^\d{6}$/.test(otp.trim())) {
          throw new Error("Enter the 6-digit OTP.");
        }

        result = await supabase.auth.verifyOtp({
          phone: phone.trim(),
          token: otp.trim(),
          type: "sms",
        });

        if (result.error) throw result.error;

        showMessage("Phone verified successfully!");
      } else if (mode === "forgot") {
        if (!email.trim()) {
          throw new Error("Enter your registered email address.");
        }

        result = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: window.location.origin,
          }
        );

        if (result.error) throw result.error;

        showMessage(
          "If an account exists for this email, a password reset link will be sent."
        );
      } else if (mode === "resetPassword") {
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        result = await supabase.auth.updateUser({ password });

        if (result.error) throw result.error;

        showMessage("Password updated successfully! You can log in now.");
        setPassword("");
        setConfirmPassword("");
        setMode("login");
      }
    } catch (error) {
      showMessage(error.message || "Something went wrong.", true);
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";
  const isPhoneMode = mode === "phone" || mode === "verifyOtp";
  const isResetMode = mode === "resetPassword";

  let heading = "Join the goodness.";

  if (mode === "login") heading = "Welcome back.";
  if (mode === "phone") heading = "Login with your phone.";
  if (mode === "verifyOtp") heading = "Verify your phone.";
  if (mode === "forgot") heading = "Reset your password.";
  if (isResetMode) heading = "Create a new password.";

  return (
    <section className="donate-section">
      <div className="form-intro">
        <p className="eyebrow">YOUR FOODRESCUE ACCOUNT</p>
        <h2>{heading}</h2>
        <p>
          Join our community to reduce food waste and get surplus food
          to people who need it.
        </p>
      </div>

      <form className="donation-form" onSubmit={handleSubmit}>
        <h3>
          {isSignup && "Create an account"}
          {mode === "login" && "Log in to your account"}
          {mode === "phone" && "Phone number login"}
          {mode === "verifyOtp" && "Enter verification code"}
          {mode === "forgot" && "Forgot password"}
          {isResetMode && "Set a new password"}
        </h3>

        {isSignup && (
          <>
            <label htmlFor="foodrescue-name">Full name</label>
            <input
              id="foodrescue-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              required
            />

            <label htmlFor="foodrescue-role">Join as</label>
            <select
              id="foodrescue-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="donor">Donor — Donate food</option>
              <option value="volunteer">
                Volunteer — Help with pickup and delivery
              </option>
              <option value="ngo">
                NGO — Coordinate food distribution
              </option>
            </select>

            {role === "ngo" && (
              <>
                <label htmlFor="foodrescue-organization">
                  NGO name
                </label>
                <input
                  id="foodrescue-organization"
                  value={organizationName}
                  onChange={(e) =>
                    setOrganizationName(e.target.value)
                  }
                  placeholder="Enter your NGO name"
                  required
                />
              </>
            )}
          </>
        )}

        {mode === "phone" && (
          <>
            <label htmlFor="otp-name">Full name (for new accounts)</label>
            <input
              id="otp-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your name"
            />

            <label htmlFor="otp-role">Join as (for new accounts)</label>
            <select
              id="otp-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="donor">Donor — Donate food</option>
              <option value="volunteer">Volunteer</option>
              <option value="ngo">NGO</option>
            </select>

            {role === "ngo" && (
              <>
                <label htmlFor="otp-organization">NGO name</label>
                <input
                  id="otp-organization"
                  value={organizationName}
                  onChange={(e) =>
                    setOrganizationName(e.target.value)
                  }
                  placeholder="Enter your NGO name"
                  required
                />
              </>
            )}
          </>
        )}

        {(isSignup || mode === "login" || mode === "forgot") && (
          <>
            <label htmlFor="foodrescue-email">Email address</label>
            <input
              id="foodrescue-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </>
        )}

        {isPhoneMode && (
          <>
            <label htmlFor="foodrescue-phone">Phone number</label>
            <input
              id="foodrescue-phone"
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              readOnly={mode === "verifyOtp"}
              required
            />
          </>
        )}

        {(isSignup || mode === "login" || isResetMode) && (
          <>
            <label htmlFor="foodrescue-password">
              {isResetMode ? "New password" : "Password"}
            </label>
            <input
              id="foodrescue-password"
              type="password"
              placeholder={
                isResetMode ? "Enter new password" : "Enter your password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </>
        )}

        {isResetMode && (
          <>
            <label htmlFor="foodrescue-confirm-password">
              Confirm new password
            </label>
            <input
              id="foodrescue-confirm-password"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </>
        )}

        {mode === "verifyOtp" && (
          <>
            <label htmlFor="foodrescue-otp">6-digit OTP</label>
            <input
              id="foodrescue-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              maxLength={6}
              required
            />
          </>
        )}

        <button type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : mode === "signup"
              ? "Create account →"
              : mode === "login"
                ? "Log in →"
                : mode === "phone"
                  ? "Send OTP →"
                  : mode === "verifyOtp"
                    ? "Verify OTP →"
                    : mode === "forgot"
                      ? "Send reset link →"
                      : "Update password →"}
        </button>

        {message && (
          <p
            className={`auth-message ${isError ? "error" : "success"}`}
            role="status"
          >
            {message}
          </p>
        )}

        {mode === "login" && (
          <p className="text-link">
            <button
              type="button"
              className="auth-toggle"
              onClick={() => changeMode("forgot")}
            >
              Forgot password?
            </button>
          </p>
        )}

        {mode === "verifyOtp" && (
          <p className="text-link">
            Didn't receive an OTP?{" "}
            <button
              type="button"
              className="auth-toggle"
              disabled={loading}
              onClick={() => changeMode("phone")}
            >
              Try again
            </button>
          </p>
        )}

        {!isPhoneMode && !isResetMode && mode !== "forgot" && (
          <p className="text-link">
            {isSignup
              ? "Already have an account? "
              : "Don't have an account? "}
            <button
              type="button"
              className="auth-toggle"
              onClick={() => changeMode(isSignup ? "login" : "signup")}
            >
              {isSignup ? "Log in" : "Sign up"}
            </button>
          </p>
        )}

        {(mode === "signup" || mode === "login") && (
          <p className="text-link">
            Or{" "}
            <button
              type="button"
              className="auth-toggle"
              onClick={() => changeMode("phone")}
            >
              continue with phone OTP
            </button>
          </p>
        )}

        {(mode === "forgot" || isResetMode || isPhoneMode) && (
          <p className="text-link">
            <button
              type="button"
              className="auth-toggle"
              onClick={() => changeMode("login")}
            >
              Back to email login
            </button>
          </p>
        )}
      </form>
    </section>
  );
}
