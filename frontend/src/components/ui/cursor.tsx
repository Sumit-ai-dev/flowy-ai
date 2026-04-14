"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function Cursor() {
  const [isHovered, setIsHovered] = useState(false);
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 300, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  useEffect(() => {
    const defaultCursor = document.body.style.cursor;
    // We keep default cursor globally but add styling, or hide it fully if we want.
    // For now we'll just overlay our custom cursor.

    const moveCursor = (e: MouseEvent) => {
      mouseX.set(e.clientX - 16);
      mouseY.set(e.clientY - 16);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Snapping or expanding effect on interactive elements
      if (
        window.getComputedStyle(target).cursor === "pointer" ||
        target.tagName.toLowerCase() === "a" ||
        target.tagName.toLowerCase() === "button"
      ) {
        setIsHovered(true);
      } else {
        setIsHovered(false);
      }
    };

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", handleMouseOver);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", handleMouseOver);
      document.body.style.cursor = defaultCursor;
    };
  }, [mouseX, mouseY]);

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-[9999] flex items-center justify-center rounded-full mix-blend-exclusion hidden md:flex"
      initial={{ width: 32, height: 32, backgroundColor: "rgb(255,255,255)" }}
      style={{
        x: cursorX,
        y: cursorY,
      }}
      animate={{
        width: isHovered ? 64 : 32,
        height: isHovered ? 64 : 32,
        backgroundColor: "rgb(255,255,255)",
        opacity: isHovered ? 0.8 : 1,
        translateX: isHovered ? "-16px" : "0px",
        translateY: isHovered ? "-16px" : "0px",
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    />
  );
}
