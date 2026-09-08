import React, { useState, useRef } from "react";

export function CommentBox({ onAddComment, inputRef }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    if (onAddComment) {
      onAddComment(trimmed);
    }
    setText("");
  };

  return (
    <div className="carousel-comment-section">
      <form
        className="comment-box"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="comment-input"
          placeholder="Add a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="comment-send"
          type="submit"
          disabled={!text.trim()}
          style={{ opacity: text.trim() ? 1 : 0.4 }}
        >
          Post
        </button>
      </form>
    </div>
  );
}

export default CommentBox;
