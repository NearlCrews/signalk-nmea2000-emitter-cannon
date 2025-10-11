# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Signal K NMEA2000 Emitter Cannon seriously. If you discover a security vulnerability, please follow these guidelines:

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of these methods:

1. **Email**: Contact the maintainer directly at the email listed in package.json
2. **GitHub Security Advisory**: Use the [GitHub Security Advisory](https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/security/advisories/new) feature (preferred)

### What to Include

Please include the following information in your report:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Update**: Within 7 days with preliminary assessment
- **Fix Timeline**: Depends on severity, typically within 30 days

### Severity Guidelines

We classify vulnerabilities using the following severity levels:

#### Critical
- Remote code execution
- Privilege escalation
- Data loss or corruption

#### High
- Denial of service
- Information disclosure of sensitive data
- Authentication bypass

#### Medium
- Cross-site scripting
- Limited information disclosure
- Minor security misconfigurations

#### Low
- Issues with minimal security impact
- Theoretical vulnerabilities requiring unlikely conditions

## Security Best Practices

When using this plugin:

1. **Keep Updated**: Always use the latest version
2. **Review Dependencies**: Regularly update dependencies
3. **Network Security**: Ensure your Signal K server is properly secured
4. **Access Control**: Limit access to your Signal K admin interface
5. **Monitor Logs**: Watch for unusual activity in Signal K logs

## Dependency Security

This project uses:
- `npm audit` for vulnerability scanning
- Automated dependency updates for security patches
- Override mechanisms for transitive dependency vulnerabilities

Run security audit:
```bash
npm audit
```

## Signal K Security

This plugin operates within the Signal K server environment. Please also refer to:
- [Signal K Security Documentation](https://signalk.org/documentation/)
- Signal K server security best practices

## Marine Safety Notice

This plugin is designed for marine navigation systems. While we strive for security and reliability:

- **Not for Safety-Critical Use**: This software should not be relied upon as the sole means of navigation
- **Professional Equipment**: Always maintain certified navigation equipment
- **Regular Verification**: Verify all navigation data against official sources
- **Test Thoroughly**: Test in non-critical conditions before relying on this plugin

## Attribution

Security issues affecting the original [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) project should be reported to that project's maintainers as well.

## Disclosure Policy

- We will coordinate disclosure timing with the reporter
- Public disclosure will occur after a fix is available
- Credit will be given to reporters (if desired)
- A security advisory will be published on GitHub

## Contact

For security concerns, please contact:
- Repository: https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon
- Issues: https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/issues
- Security: Use GitHub Security Advisory feature

Thank you for helping keep Signal K NMEA2000 Emitter Cannon secure!