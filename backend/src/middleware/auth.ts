import { Request, Response, NextFunction } from 'express';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Here you would typically verify the token
    // For example, using a library like jsonwebtoken
    // jwt.verify(token, secretKey, (err, decoded) => {
    //     if (err) {
    //         return res.status(403).json({ message: 'Forbidden' });
    //     }
    //     req.user = decoded; // Attach user info to request
    //     next();
    // });

    // For now, we'll just call next() to proceed
    next();
};

export const authorize = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const userRole = (req as any).user?.role; // Assuming user role is attached to req.user

        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        next();
    };
};