import { useEffect, useState } from "react";
import "./App.css";
import Auth from "./Auth";
import FoodDonation from "./FoodDonation";
import { supabase } from "./supabase";

const heroImages = [
  "/festival-girls.jpg.webp",
  "/family-support.jpg",
  "/child-meal.jpg",
  "/community-meal.jpg",
];

const campaigns = [
  {
    title: "Navratri Gift Donation",
    image: "/festival-girls.jpg",
    icon: "🎁",
    description:
      "Bring happiness to children by donating gifts and essentials.",
  },
  {
    title: "Diwali Gift Donation",
    image: "/family-support.jpg",
    icon: "🪔",
    description:
      "Make someone's Diwali brighter with your kindness.",
  },
  {
    title: "Food for Children",
    image: "/child-meal.jpg",
    icon: "🍲",
    description:
      "Help provide nutritious meals to children in need.",
  },
  {
    title: "Community Food Support",
    image: "/community-meal.jpg",
    icon: "💚",
    description:
      "Support families and communities through food donations.",
  },
];

function App() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check login session and listen for login/logout changes
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error("Session error:", error.message);
        setSession(null);
      } else {
        setSession(data.session);
      }

      setAuthLoading(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Automatically change the hero image every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(
        (previous) => (previous + 1) % heroImages.length
      );
    }, 4000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const goToDonation = () => {
    document.getElementById("donation")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const goToFoodDonation = () => {
    document.getElementById("food-donation")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  return (
    <div className="app">
      {/* NAVBAR */}
      <header className="navbar">
        <a href="#home" className="logo">
          Food<span>Rescue</span>
          <span className="logo-heart"> ♥</span>
        </a>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#about">About Us</a>
          <a href="#campaigns">Campaigns</a>
          <a href="#donation">Donate</a>
          <a href="#help">Contact</a>
        </nav>

        <button className="nav-donate" onClick={goToDonation}>
          Donate Now
        </button>
      </header>

      <main>
        {/* HERO IMAGE SLIDER */}
        <section className="hero" id="home">
          {heroImages.map((image, index) => (
            <img
              key={image}
              src={image}
              alt="Food donation and community support"
              className={`hero-image ${
                currentSlide === index ? "active" : ""
              }`}
            />
          ))}

          <div className="hero-overlay"></div>

          <div className="hero-content">
            <span className="hero-tag">
              ❤️ Together, We Can Make A Difference
            </span>

            <h1>
              Share Food,
              <br />
              <span>Spread Happiness</span>
            </h1>

            <p>
              Your small contribution can bring a big smile.
              Help us feed people in need and make every meal count.
            </p>

            <div className="hero-buttons">
              <button className="primary-btn" onClick={goToDonation}>
                Donate Now <span>♥</span>
              </button>

              <a href="#about" className="secondary-btn">
                Learn More →
              </a>
            </div>

            <div className="hero-note">
              <span>🌱</span>
              Every meal shared is a little more hope given.
            </div>
          </div>

          <div className="slider-dots">
            {heroImages.map((image, index) => (
              <button
                key={image}
                className={
                  currentSlide === index ? "dot active" : "dot"
                }
                onClick={() => setCurrentSlide(index)}
                aria-label={`Show slide ${index + 1}`}
              />
            ))}
          </div>

          <div className="hero-number">
            <span>0{currentSlide + 1}</span> / 0{heroImages.length}
          </div>
        </section>

        {/* IMPACT STRIP */}
        <section className="impact-strip">
          <div className="impact-item">
            <span className="impact-icon">🍲</span>
            <div>
              <h3>Fight Hunger</h3>
              <p>Help people access meals</p>
            </div>
          </div>

          <div className="impact-item">
            <span className="impact-icon">🤝</span>
            <div>
              <h3>Share Kindness</h3>
              <p>Make a difference together</p>
            </div>
          </div>

          <div className="impact-item">
            <span className="impact-icon">🌍</span>
            <div>
              <h3>Reduce Food Waste</h3>
              <p>Give food a second chance</p>
            </div>
          </div>

          <div className="impact-item">
            <span className="impact-icon">💚</span>
            <div>
              <h3>Build Hope</h3>
              <p>Support your community</p>
            </div>
          </div>
        </section>

        {/* ABOUT SECTION */}
        <section className="about-section section" id="about">
          <div className="section-heading">
            <span className="eyebrow">WHO WE ARE</span>
            <h2>
              Small Acts, <span>Big Impact</span>
            </h2>
            <p>
              We believe that no one should go hungry. Together, we can
              turn kindness into action and make a positive difference.
            </p>
          </div>

          <div className="about-grid">
            <article className="about-card">
              <div className="about-icon">🥗</div>
              <h3>Save Food</h3>
              <p>
                Help reduce food waste by supporting responsible food
                sharing and donations.
              </p>
            </article>

            <article className="about-card">
              <div className="about-icon">❤️</div>
              <h3>Feed People</h3>
              <p>
                Your generosity helps bring food and hope to people
                who need support.
              </p>
            </article>

            <article className="about-card">
              <div className="about-icon">🌱</div>
              <h3>Spread Kindness</h3>
              <p>
                Every act of giving helps build a stronger and more
                caring community.
              </p>
            </article>
          </div>
        </section>

        {/* CAMPAIGNS */}
        <section className="campaign-section section" id="campaigns">
          <div className="section-heading">
            <span className="eyebrow">MAKE A DIFFERENCE</span>
            <h2>
              Our <span>Campaigns</span>
            </h2>
            <p>
              Choose a cause close to your heart and become part of
              something meaningful.
            </p>
          </div>

          <div className="campaign-grid">
            {campaigns.map((campaign) => (
              <article className="campaign-card" key={campaign.title}>
                <div className="campaign-image-wrap">
                  <img src={campaign.image} alt={campaign.title} />
                  <span className="campaign-icon">
                    {campaign.icon}
                  </span>
                </div>

                <div className="campaign-content">
                  <h3>{campaign.title}</h3>
                  <p>{campaign.description}</p>

                  <button
                    className="campaign-link"
                    onClick={goToDonation}
                  >
                    Support This Cause <span>→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* LOGIN / AUTH SECTION */}
        <section className="donation-section section" id="donation">
          <div className="donation-intro">
            <span className="eyebrow">YOUR KINDNESS MATTERS</span>
            <h2>
              Be the Reason
              <br />
              Someone <span>Smiles Today</span>
            </h2>
            <p>
              Every contribution, big or small, can help someone in need.
              Join us in creating a world where food and kindness are
              shared.
            </p>

            <div className="donation-points">
              <div>✓ Support people in need</div>
              <div>✓ Spread hope through kindness</div>
              <div>✓ Help build a caring community</div>
            </div>
          </div>

          <div className="auth-wrapper">
            {authLoading ? (
              <p>Checking your login...</p>
            ) : session?.user ? (
              <div className="auth-success">
                <h3>Welcome to FoodRescue! ❤️</h3>
                <p>You are logged in and can donate food now.</p>
                <button
                  className="primary-btn"
                  onClick={goToFoodDonation}
                >
                  Open Donation Form →
                </button>
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    const { error } = await supabase.auth.signOut();

                    if (error) {
                      console.error("Logout failed:", error.message);
                    }
                  }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <Auth />
            )}
          </div>
        </section>

        {/* FOOD DONATION FORM: LOGIN REQUIRED */}
        <section id="food-donation">
          {authLoading ? (
            <div className="section">
              <p>Checking your login...</p>
            </div>
          ) : session?.user ? (
            <FoodDonation />
          ) : (
            <div className="section">
              <div className="section-heading">
                <span className="eyebrow">SHARE FOOD, SPREAD HOPE</span>
                <h2>
                  Login to <span>Donate Food</span>
                </h2>
                <p>
                  Please log in or create an account above to open the
                  food donation form and share extra food with people
                  in need.
                </p>
                <button
                  className="primary-btn"
                  onClick={goToDonation}
                >
                  Login / Sign Up →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* HELP SECTION */}
        <section className="help-section section" id="help">
          <div className="help-content">
            <span className="eyebrow">LET'S WORK TOGETHER</span>
            <h2>
              Kindness Starts <span>With You</span>
            </h2>
            <p>
              Have a question or want to help? Take the first step
              toward making a difference today.
            </p>

            <button className="primary-btn" onClick={goToDonation}>
              Get Involved ❤️
            </button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-main">
          <div className="footer-brand">
            <a href="#home" className="logo footer-logo">
              Food<span>Rescue</span> ♥
            </a>
            <p>
              Sharing food. Spreading hope. Building a kinder world,
              one meal at a time.
            </p>
          </div>

          <div className="footer-links">
            <h4>Quick Links</h4>
            <a href="#home">Home</a>
            <a href="#about">About Us</a>
            <a href="#campaigns">Campaigns</a>
            <a href="#donation">Donate</a>
          </div>

          <div className="footer-links">
            <h4>Our Mission</h4>
            <p>Reduce food waste</p>
            <p>Support communities</p>
            <p>Spread kindness</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} FoodRescue. Made with ❤️ for humanity.
          </p>
          <a href="#home">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}

export default App;