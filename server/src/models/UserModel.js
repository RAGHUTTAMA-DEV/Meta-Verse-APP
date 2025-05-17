import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
const schema=new mongoose.Schema;

const userSchema=new schema({
    username:{
        type:String,unique:true,required:true,
        
    },
    email:{
        type:String,unique:true,required:true,
    },
    password:{
        type:String,required:true,
    },
    avatar:{
        type:String,
        default:"https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ-957XqQ4XfP5qZKsZpbE4jFgZ_YXDQg3OvA&s",
    },
    currrentRoom:{
        type:String,
    },
    position:{
        x:{type:Number,default:0},
        y:{type:Number,default:0},
    },
    isOnline:{
        type:Boolean,default:false,
    },
    lastSeen:{
        type:Date,default:Date.now,
    }

})

userSchema.pre('save',async function(next){
    if(!this.isModified('password')){
        next();
    }
   try{
    this.password=await bcrypt.hash(this.password,10);
    next();
   }catch(err){
     next(err);
   }
})

userSchema.methods.comparePassword=async function(password){
    try{
        return await bcrypt.compare(password,this.password);
    }catch(err){
        throw new Error("Invalid password");
    }
}


module.exports=mongoose.model("User",userSchema);