#!/usr/bin/env node

/**
 * Wikimedia Foundation
 *
 * LICENSE
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * @author    Ori Livneh <ori@wikimedia.org>
 */

/*jslint node:true white:true vars:true */

'use strict';

var fs = require( 'fs' );
var https = require( 'https' );

var slice = Array.prototype.slice;
var parse = JSON.parse;
var skel = { jsonrpc : '2.0' };  // params attached to all requests

//
// Helpers
//

// Copy own properties from argv[1..n] to destination
function extend( dest ) {
    var sources = slice.call( arguments );
    sources.forEach( function ( src ) {
        Object.getOwnPropertyNames( src ).forEach( function ( k ) {
            dest[ k ] = src[ k ];
        } );
    } );
    return dest;
}

//
// JSON-RPC Client
//

function gerrit( service, method ) {

    var params = slice.call( arguments, 2 );
    var payload = extend( { method: method }, skel );
    var headers = {};

    if ( params.length ) {
        payload.params = params;
    }

    payload = JSON.stringify( payload );

    headers[ 'Accept' ] = 'application/json';
    headers[ 'Content-Length' ] = Buffer.byteLength( payload );
    headers[ 'Content-Type' ] = 'application/json; charset=UTF-8';

    var req = https.request( {

        host    : 'gerrit.wikimedia.org',
        path    : '/r/gerrit/rpc/' + service,
        method  : 'POST',
        headers : headers

    }, function ( resp ) {

        var cookies = resp.headers[ 'set-cookie' ];
        var body = [];
        var session;

        if ( cookies !== undefined && cookies.length ) {
            session = /^GerritAccount=(\w+);/.exec( cookies[0] );
            if ( session !== null ) {
                skel.xsrfKey = session[ 1 ];
            }
        }

        resp.setEncoding( 'utf8' );
        resp.on( 'data', body.push.bind(body) );
        resp.on( 'end', function () {
            body = body.join( '' );
            req.emit( 'done', parse( body ) );
        } );

    } );

    req.done = req.on.bind( req, 'done' );
    req.end( payload );

    return req;
}

// Serialize object into a Gerrit query (space-separated 'key:val' pairs)
gerrit.querify = function ( map ) {
    return Object.keys( map ).map( function ( key ) {
        var val = map[ key ];
        return [ key, val ].join( ':' );
    } ).join( ' ' );
};

//
// Sample API Functions
//

// gerrit.auth( user, pass ).done( ... )
// once authenticated, all subsequent requests are too
gerrit.auth = gerrit.bind( null, 'UserPassAuthService', 'authenticate' );

// list all projects -- useful for git / bash autocompletion
gerrit.ls = gerrit.bind( null, 'ProjectAdminService', 'visibleProjects' );

// search gerrit
// e.g. gerrit.query( { status:open } );
gerrit.query = function ( query, max ) {

    if ( max === undefined ) {
        max = 25;
    }

    if ( typeof query === 'object' ) {
        query = gerrit.querify( query );
    }

    return gerrit( 'ChangeListService', 'allQueryNext', query, 'z', max.toString() );
};

module.exports = gerrit;
