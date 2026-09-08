# Instagram Profile

A responsive Instagram-style profile/gallery built using React and Vite.

## Features

- Instagram-style profile photo grid
- Responsive layout for desktop, tablet, and mobile
- Posts loaded from JSONPlaceholder API
- Images loaded from Picsum Photos
- Infinite scrolling to load more posts
- Loading skeleton while fetching posts
- Debounced search functionality
- Search posts by:
  - Post ID
  - Title
  - Caption
  - Username
  - Category
  - Hashtags
- Dynamic carousel modal for viewing posts
- Previous and Next navigation in carousel
- Like functionality
- Bookmark functionality
- Comment functionality
- Keyboard support:
  - `Escape` to close carousel
  - `Left Arrow` to view previous post
  - `Right Arrow` to view next post

## Technologies Used

- React
- JavaScript
- JSX
- CSS
- Vite
- JSONPlaceholder API
- Picsum Photos API
- React Hooks

## React Hooks Used

- `useState`
- `useEffect`
- `useRef`
- `useCallback`
- `useMemo`
- Custom Hooks:
  - `useDebounce`
  - `useInfiniteScroll`

## Project Structure

```text
Instagram-profile/
├── src/
│   ├── components/
│   │   ├── Carousel.jsx
│   │   ├── CommentBox.jsx
│   │   ├── Header.jsx
│   │   ├── LoadingSkeleton.jsx
│   │   ├── PostCard.jsx
│   │   └── PostGrid.jsx
│   │
│   ├── hooks/
│   │   ├── useDebounce.js
│   │   └── useInfiniteScroll.js
│   │
│   ├── services/
│   │   └── api.js
│   │
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
│
├── index.html
├── package.json
├── vite.config.js
└── README.md