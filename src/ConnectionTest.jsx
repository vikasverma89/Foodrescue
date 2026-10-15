
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function ConnectionTest() {
  const [message, setMessage] = useState("Connecting to database...");

  useEffect(() => {
    async function checkDatabase() {
      const { error } = await supabase
        .from("donations")
        .select("id")
        .limit(1);

      setMessage(
        error
          ? `Connection error: ${error.message}`
          : "Connected to Supabase successfully!"
      );
    }

    checkDatabase();
  }, []);

  return <p>{message}</p>;
}
