module.exports.isLoggedIn= (req, res, next)=>{
  if(!req.isAuthenticated())
    {
      return res.redirect('/login');
    }
  next();
}

module.exports.isAdmin= (req, res, next)=>{
  if(req.user.post!='Admin')
    {
      return res.redirect('/logout');
    }
  next();
}

module.exports.isLegal= (req, res, next)=>{
  if(req.user.post!='Legal Team Member')
    {
      return res.redirect('/logout');
    }
  next();
}