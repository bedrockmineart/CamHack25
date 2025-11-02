import React from 'react';
import './globals.css';
// Header removed — monitor page will show its own controls

const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <html lang="en">
            <body>
                {/* top header removed */}
                {children}
            </body>
        </html>
    );
};

export default Layout;