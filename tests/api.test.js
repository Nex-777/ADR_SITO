import { describe, it, expect, vi } from 'vitest';
import getIpHandler from '../api/get-ip.js';

describe('GET /api/get-ip', () => {
    it('returns the IP address from headers', async () => {
        const req = {
            method: 'GET',
            headers: {
                'x-forwarded-for': '192.168.1.1'
            },
            socket: {}
        };
        
        let status = 200;
        let responseData = null;
        
        const res = {
            setHeader: vi.fn(),
            status: vi.fn((s) => {
                status = s;
                return res;
            }),
            json: vi.fn((data) => {
                responseData = data;
                return res;
            })
        };

        await getIpHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalled();
        expect(responseData).toEqual({ ip: '192.168.1.1' });
    });

    it('returns 127.0.0.1 if no header is present', async () => {
        const req = {
            method: 'GET',
            headers: {},
            socket: { remoteAddress: '127.0.0.1' }
        };
        
        let status = 200;
        let responseData = null;
        
        const res = {
            setHeader: vi.fn(),
            status: vi.fn((s) => {
                status = s;
                return res;
            }),
            json: vi.fn((data) => {
                responseData = data;
                return res;
            })
        };

        await getIpHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalled();
        expect(responseData).toEqual({ ip: '127.0.0.1' });
    });
});
