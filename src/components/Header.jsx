import React from "react";

export function Header({ searchTerm, onSearchChange }) {
  return (
    <header className="page-header">
      <h1 className="instagram-logo">Instagram</h1>

      <input
        type="search"
        id="searchInput"
        className="search-bar"
        placeholder="Search"
        aria-label="Search posts"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </header>
  );
}

export default Header;
