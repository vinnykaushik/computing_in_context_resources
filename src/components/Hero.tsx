import { useState, useEffect, useRef } from "react";

type HeroProps = {
  resetSearch: () => void;
};

export default function Hero({ resetSearch }: HeroProps) {
  const [resetKey, setResetKey] = useState(0);
  const [text, setText] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const fullText = "<computingInContext/>";
  const indexRef = useRef(0);

  useEffect(() => {
    setText("");
    setIsTypingComplete(false);
    indexRef.current = 0;

    const typeNextCharacter = () => {
      if (indexRef.current < fullText.length) {
        setText(fullText.substring(0, indexRef.current + 1));
        indexRef.current += 1;
        setTimeout(typeNextCharacter, 100); // Adjust typing speed here
      } else {
        setIsTypingComplete(true);
      }
    };

    typeNextCharacter();
  }, [resetKey]);

  const handleReset = () => {
    setResetKey((prev) => prev + 1); // Reset the typing animation
    if (typeof resetSearch === "function") {
      resetSearch(); // Call the parent's resetSearch function
    }
  };

  return (
    <div className="relative overflow-hidden bg-white shadow-sm">
      <div className="mx-auto max-w-4xl px-8 py-16">
        <div onClick={handleReset} className="cursor-pointer text-center">
          <h1 className="from-secondary to-tertiary bg-gradient-to-r bg-clip-text pb-2 font-mono text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
            <span
              className={`inline-block border-r-2 ${isTypingComplete ? "border-gray-500" : "border-transparent"} pr-1`}
            >
              {text}
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Find CS lessons that connect abstract concepts with real-world
            problems
          </p>
        </div>
      </div>
    </div>
  );
}
