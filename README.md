# Vegas GitHub Event Viewer

A modern web application built with Next.js that displays GitHub events in a stylish, user-friendly interface.

## Features

- 🔄 Real-time GitHub event tracking
- 🎨 Modern UI built with Radix UI components and Tailwind CSS
- 📱 Fully responsive design
- 🌓 Light/dark mode with next-themes
- 📊 Data visualization with Recharts
- 📆 Date selection with react-day-picker
- 🧩 Component-based architecture

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/)
- **State Management**: React Hooks
- **Form Handling**: react-hook-form
- **Data Validation**: Zod
- **Data Visualization**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or pnpm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/vegas-github-event-viewer.git
cd vegas-github-event-viewer
```

2. Install dependencies:

```bash
npm install
# or
pnpm install
```

3. Run the development server:

```bash
npm run dev
# or
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/                 # Next.js app directory
├── components/          # Reusable UI components
│   └── ui/              # UI component library
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions & shared code
├── public/              # Static assets
└── styles/              # Global styles
```

## Environment Variables

Create a `.env.local` file at the root of your project with the following variables:

```
# GitHub API
GITHUB_TOKEN=your_github_token
```

## Deployment

This project can be deployed on [Vercel](https://vercel.com/) with zero configuration:

```bash
npm run build
# or
vercel
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Radix UI](https://www.radix-ui.com/) for accessible UI components
- [Tailwind CSS](https://tailwindcss.com/) for utility-first CSS framework
- [Next.js](https://nextjs.org/) for the React framework
