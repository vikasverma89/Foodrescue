
import { useState } from "react";
import { supabase } from "./supabase";

export default function FoodDonation() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    quantity: "",
    food_type: "Cooked Food",
    pickup_address: "",
    pickup_deadline: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Pehle login karo, phir food donate karo.");
      }

      // Check that the logged-in user has a donor profile.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profile check:", profileError);
        throw new Error(
          "Profile check nahi ho paya. Supabase profiles ki SELECT policy check karo."
        );
      }

      if (!profile) {
        throw new Error(
          "Tumhara profile create nahi hua. Supabase signup trigger check karna hoga."
        );
      }

      if (profile.role !== "donor") {
        throw new Error(
          `Tumhara profile role "${profile.role}" hai. Food donate karne ke liye donor role zaroori hai.`
        );
      }

      const deadline = new Date(form.pickup_deadline);

      if (
        !form.pickup_deadline ||
        Number.isNaN(deadline.getTime()) ||
        deadline <= new Date()
      ) {
        throw new Error("Pickup deadline future mein select karo.");
      }

      const quantity = Number(form.quantity);

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Quantity kam se kam 1 serving honi chahiye.");
      }

      const { error: insertError } = await supabase
        .from("food_listings")
        .insert({
          donor_id: user.id,
          title: form.title.trim(),
          description: form.description.trim(),
          quantity,
          food_type: form.food_type,
          pickup_address: form.pickup_address.trim(),
          pickup_deadline: deadline.toISOString(),
          status: "available",
        });

      if (insertError) {
        console.error("Food listing insert failed:", insertError);
        throw new Error(
          `Donation save nahi hui: ${insertError.message}`
        );
      }

      setMessage("Food donation successfully submit ho gayi! ❤️");
      setIsError(false);

      setForm({
        title: "",
        description: "",
        quantity: "",
        food_type: "Cooked Food",
        pickup_address: "",
        pickup_deadline: "",
      });
    } catch (err) {
      setIsError(true);
      setMessage(err.message || "Donation submit nahi ho payi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="food-donation-form-section section"
      id="food-donation"
    >
      <div className="section-heading">
        <span className="eyebrow">SHARE FOOD, SPREAD HOPE</span>
        <h2>
          Donate Your <span>Extra Food</span>
        </h2>
        <p>
          Apna extra food list karo taaki NGO aur volunteers use
          zaruratmand logon tak pahunchane mein help kar sakein.
        </p>
      </div>

      <form className="donation-form" onSubmit={handleSubmit}>
        <label htmlFor="donation-title">Food Name</label>
        <input
          id="donation-title"
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="e.g. Fresh meal packets"
          required
        />

        <label htmlFor="donation-type">Food Type</label>
        <select
          id="donation-type"
          name="food_type"
          value={form.food_type}
          onChange={handleChange}
          required
        >
          <option>Cooked Food</option>
          <option>Packaged Food</option>
          <option>Fruits and Vegetables</option>
          <option>Bakery Items</option>
          <option>Other</option>
        </select>

        <label htmlFor="donation-quantity">Quantity (servings)</label>
        <input
          id="donation-quantity"
          name="quantity"
          type="number"
          min="1"
          step="1"
          value={form.quantity}
          onChange={handleChange}
          placeholder="e.g. 20"
          required
        />

        <label htmlFor="donation-address">Pickup Address</label>
        <textarea
          id="donation-address"
          name="pickup_address"
          rows="3"
          value={form.pickup_address}
          onChange={handleChange}
          placeholder="Enter complete pickup address"
          required
        />

        <label htmlFor="donation-deadline">Pickup Deadline</label>
        <input
          id="donation-deadline"
          name="pickup_deadline"
          type="datetime-local"
          min={new Date(Date.now() + 60000)
            .toISOString()
            .slice(0, 16)}
          value={form.pickup_deadline}
          onChange={handleChange}
          required
        />

        <label htmlFor="donation-description">Additional Details</label>
        <textarea
          id="donation-description"
          name="description"
          rows="3"
          value={form.description}
          onChange={handleChange}
          placeholder="Packaging, food freshness, special details..."
        />

        {message && (
          <p
            className={`auth-message ${isError ? "error" : "success"}`}
            role="status"
          >
            {message}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit Food Donation →"}
        </button>
      </form>
    </section>
  );
}
